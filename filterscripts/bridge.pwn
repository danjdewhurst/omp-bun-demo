/**
 * Bun IPC Bridge Filterscript
 * Forwards open.mp events to a Bun TypeScript server via Redis pub/sub
 * and receives commands from Bun.
 */

// Increase stack size to handle larger buffers
#pragma dynamic 8192

#include <open.mp>
#include <redis>

// Configuration
#define REDIS_HOST "redis"
#define REDIS_PORT 6379
#define REDIS_AUTH ""
#define CHANNEL_EVENTS "omp:events"
#define CHANNEL_COMMANDS "omp:commands"
#define BRIDGE_MAX_MESSAGE_SIZE 2048

// Redis connections
static Redis:gRedisPublisher = Redis:-1;
static PubSub:gRedisSubscriber = PubSub:-1;
static bool:gBridgeConnected = false;
static gMessageId = 0;

// Forward declarations
forward Bridge_OnCommand(channel[], data[]);

// ------------------------------------
// Utility Functions
// ------------------------------------

stock Bridge_EscapeJSON(const input[], output[], maxlen)
{
    new j = 0;
    for (new i = 0; input[i] != 0 && j < maxlen - 2; i++)
    {
        new c = input[i];
        if (c == 34) // " character
        {
            output[j++] = 92; // backslash
            output[j++] = 34; // "
        }
        else if (c == 92) // backslash
        {
            output[j++] = 92;
            output[j++] = 92;
        }
        else if (c == 10) // \n
        {
            output[j++] = 92;
            output[j++] = 110; // n
        }
        else if (c == 13) // \r
        {
            output[j++] = 92;
            output[j++] = 114; // r
        }
        else if (c == 9) // \t
        {
            output[j++] = 92;
            output[j++] = 116; // t
        }
        else
        {
            output[j++] = c;
        }
    }
    output[j] = 0;
    return j;
}

// ------------------------------------
// Connection Management
// ------------------------------------

stock Bridge_Connect()
{
    // Connect publisher
    new ret = Redis_Connect(REDIS_HOST, REDIS_PORT, REDIS_AUTH, gRedisPublisher);
    if (ret != 0)
    {
        printf("[Bridge] Failed to connect publisher to Redis: %d", ret);
        return 0;
    }

    // Subscribe to commands channel
    ret = Redis_Subscribe(REDIS_HOST, REDIS_PORT, REDIS_AUTH, CHANNEL_COMMANDS, "Bridge_OnCommand", gRedisSubscriber);
    if (ret != 0)
    {
        printf("[Bridge] Failed to subscribe to commands: %d", ret);
        Redis_Disconnect(gRedisPublisher);
        gRedisPublisher = Redis:-1;
        return 0;
    }

    gBridgeConnected = true;
    print("[Bridge] Connected to Redis");

    // Send handshake
    Bridge_SendEvent("OnBridgeInit", "{}");

    return 1;
}

// ------------------------------------
// Message Sending
// ------------------------------------

stock Bridge_SendEvent(const eventName[], const payload[])
{
    if (!gBridgeConnected) return 0;

    new message[BRIDGE_MAX_MESSAGE_SIZE];
    format(message, sizeof(message), "{\"e\":\"%s\",\"d\":%s,\"id\":%d,\"t\":%d}",
           eventName, payload, ++gMessageId, GetTickCount());

    Redis_Publish(gRedisPublisher, CHANNEL_EVENTS, message);
    return 1;
}

// ------------------------------------
// Command Handling
// ------------------------------------

public Bridge_OnCommand(channel[], data[])
{
    // Parse command JSON: {"c":"CommandName","a":[args],"id":123}
    new command[64];
    new args[BRIDGE_MAX_MESSAGE_SIZE];
    new msgId[16];

    // Extract "c" field
    new cPos = strfind(data, "\"c\":\"");
    if (cPos != -1)
    {
        cPos += 5;
        new endPos = strfind(data, "\"", false, cPos);
        if (endPos != -1)
        {
            strmid(command, data, cPos, endPos);
        }
    }

    // Extract "id" field for response correlation
    new idPos = strfind(data, "\"id\":");
    if (idPos != -1)
    {
        idPos += 5;
        new endPos = idPos;
        while (data[endPos] >= '0' && data[endPos] <= '9') endPos++;
        strmid(msgId, data, idPos, endPos);
    }

    // Extract "a" field (array)
    new aPos = strfind(data, "\"a\":[");
    if (aPos != -1)
    {
        aPos += 4;
        new depth = 0, endPos = aPos;
        for (new i = aPos; data[i] != 0; i++)
        {
            if (data[i] == '[') depth++;
            else if (data[i] == ']')
            {
                depth--;
                if (depth == 0)
                {
                    endPos = i + 1;
                    break;
                }
            }
        }
        strmid(args, data, aPos, endPos);
    }

    // Execute command
    new result = Bridge_ExecuteCommand(command, args);

    // Send response
    new response[256];
    format(response, sizeof(response), "{\"ok\":true,\"r\":%d,\"id\":%s}", result, msgId);
    Redis_Publish(gRedisPublisher, "omp:responses", response);

    return 1;
}

// ------------------------------------
// Argument Parsing Helpers
// ------------------------------------

stock Bridge_ParseIntArg(const args[], index)
{
    new depth = 0, argIndex = 0, start = -1, end = -1;

    for (new i = 0; args[i] != 0; i++)
    {
        if (args[i] == '[' || args[i] == '{') depth++;
        else if (args[i] == ']' || args[i] == '}') depth--;
        else if (depth == 1)
        {
            if (args[i] != ',' && args[i] != ' ' && start == -1)
            {
                start = i;
            }
            if ((args[i] == ',' || args[i + 1] == ']') && start != -1)
            {
                end = (args[i] == ',') ? i : i + 1;
                if (argIndex == index)
                {
                    new numStr[32];
                    strmid(numStr, args, start, end);
                    return strval(numStr);
                }
                argIndex++;
                start = -1;
            }
        }
    }
    return 0;
}

stock Float:Bridge_ParseFloatArg(const args[], index)
{
    new depth = 0, argIndex = 0, start = -1, end = -1;

    for (new i = 0; args[i] != 0; i++)
    {
        if (args[i] == '[' || args[i] == '{') depth++;
        else if (args[i] == ']' || args[i] == '}') depth--;
        else if (depth == 1)
        {
            if (args[i] != ',' && args[i] != ' ' && start == -1)
            {
                start = i;
            }
            if ((args[i] == ',' || args[i + 1] == ']') && start != -1)
            {
                end = (args[i] == ',') ? i : i + 1;
                if (argIndex == index)
                {
                    new numStr[32];
                    strmid(numStr, args, start, end);
                    return floatstr(numStr);
                }
                argIndex++;
                start = -1;
            }
        }
    }
    return 0.0;
}

stock Bridge_ParseStringArg(const args[], index, output[], maxlen)
{
    new depth = 0, argIndex = 0, inString = false, start = -1;

    for (new i = 0; args[i] != 0; i++)
    {
        if (args[i] == '"' && (i == 0 || args[i-1] != '\\'))
        {
            if (!inString)
            {
                inString = true;
                if (argIndex == index) start = i + 1;
            }
            else
            {
                inString = false;
                if (argIndex == index && start != -1)
                {
                    strmid(output, args, start, i, maxlen);
                    return strlen(output);
                }
            }
        }
        else if (!inString)
        {
            if (args[i] == '[' || args[i] == '{') depth++;
            else if (args[i] == ']' || args[i] == '}') depth--;
            else if (args[i] == ',' && depth == 1) argIndex++;
        }
    }
    output[0] = 0;
    return 0;
}

// ------------------------------------
// Command Execution
// ------------------------------------

stock Bridge_ExecuteCommand(const command[], const args[])
{
    // Player message commands
    if (!strcmp(command, "SendClientMessage"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new colour = Bridge_ParseIntArg(args, 1);
        new message[144];
        Bridge_ParseStringArg(args, 2, message, sizeof(message));
        return SendClientMessage(playerid, colour, message);
    }
    else if (!strcmp(command, "SendClientMessageToAll"))
    {
        new colour = Bridge_ParseIntArg(args, 0);
        new message[144];
        Bridge_ParseStringArg(args, 1, message, sizeof(message));
        return SendClientMessageToAll(colour, message);
    }
    else if (!strcmp(command, "GameTextForPlayer"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new text[256];
        Bridge_ParseStringArg(args, 1, text, sizeof(text));
        new time = Bridge_ParseIntArg(args, 2);
        new style = Bridge_ParseIntArg(args, 3);
        return _:GameTextForPlayer(playerid, text, time, style);
    }
    // Player position/state
    else if (!strcmp(command, "SetPlayerPos"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new Float:x = Bridge_ParseFloatArg(args, 1);
        new Float:y = Bridge_ParseFloatArg(args, 2);
        new Float:z = Bridge_ParseFloatArg(args, 3);
        return _:SetPlayerPos(playerid, x, y, z);
    }
    else if (!strcmp(command, "SetPlayerHealth"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new Float:health = Bridge_ParseFloatArg(args, 1);
        return _:SetPlayerHealth(playerid, health);
    }
    else if (!strcmp(command, "SetPlayerArmour"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new Float:armour = Bridge_ParseFloatArg(args, 1);
        return _:SetPlayerArmour(playerid, armour);
    }
    else if (!strcmp(command, "GivePlayerWeapon"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new weaponid = Bridge_ParseIntArg(args, 1);
        new ammo = Bridge_ParseIntArg(args, 2);
        return _:GivePlayerWeapon(playerid, WEAPON:weaponid, ammo);
    }
    else if (!strcmp(command, "GivePlayerMoney"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new amount = Bridge_ParseIntArg(args, 1);
        return _:GivePlayerMoney(playerid, amount);
    }
    else if (!strcmp(command, "SetPlayerScore"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new score = Bridge_ParseIntArg(args, 1);
        return _:SetPlayerScore(playerid, score);
    }
    else if (!strcmp(command, "SetPlayerSkin"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new skinid = Bridge_ParseIntArg(args, 1);
        return _:SetPlayerSkin(playerid, skinid);
    }
    else if (!strcmp(command, "SetPlayerInterior"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new interiorid = Bridge_ParseIntArg(args, 1);
        return _:SetPlayerInterior(playerid, interiorid);
    }
    else if (!strcmp(command, "SetPlayerVirtualWorld"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new worldid = Bridge_ParseIntArg(args, 1);
        return _:SetPlayerVirtualWorld(playerid, worldid);
    }
    else if (!strcmp(command, "SpawnPlayer"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        return _:SpawnPlayer(playerid);
    }
    else if (!strcmp(command, "Kick"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        return _:Kick(playerid);
    }
    else if (!strcmp(command, "Ban"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        return _:Ban(playerid);
    }
    // Vehicle commands
    else if (!strcmp(command, "CreateVehicle"))
    {
        new modelid = Bridge_ParseIntArg(args, 0);
        new Float:x = Bridge_ParseFloatArg(args, 1);
        new Float:y = Bridge_ParseFloatArg(args, 2);
        new Float:z = Bridge_ParseFloatArg(args, 3);
        new Float:angle = Bridge_ParseFloatArg(args, 4);
        new color1 = Bridge_ParseIntArg(args, 5);
        new color2 = Bridge_ParseIntArg(args, 6);
        new respawnDelay = Bridge_ParseIntArg(args, 7);
        return CreateVehicle(modelid, x, y, z, angle, color1, color2, respawnDelay);
    }
    else if (!strcmp(command, "DestroyVehicle"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        return _:DestroyVehicle(vehicleid);
    }
    else if (!strcmp(command, "SetVehicleHealth"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        new Float:health = Bridge_ParseFloatArg(args, 1);
        return _:SetVehicleHealth(vehicleid, health);
    }
    else if (!strcmp(command, "RepairVehicle"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        return _:RepairVehicle(vehicleid);
    }
    else if (!strcmp(command, "SetVehiclePos"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        new Float:x = Bridge_ParseFloatArg(args, 1);
        new Float:y = Bridge_ParseFloatArg(args, 2);
        new Float:z = Bridge_ParseFloatArg(args, 3);
        return _:SetVehiclePos(vehicleid, x, y, z);
    }
    else if (!strcmp(command, "SetVehicleZAngle"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        new Float:angle = Bridge_ParseFloatArg(args, 1);
        return _:SetVehicleZAngle(vehicleid, angle);
    }
    else if (!strcmp(command, "ChangeVehicleColor"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        new color1 = Bridge_ParseIntArg(args, 1);
        new color2 = Bridge_ParseIntArg(args, 2);
        return _:ChangeVehicleColor(vehicleid, color1, color2);
    }
    else if (!strcmp(command, "SetVehicleVelocity"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        new Float:x = Bridge_ParseFloatArg(args, 1);
        new Float:y = Bridge_ParseFloatArg(args, 2);
        new Float:z = Bridge_ParseFloatArg(args, 3);
        return _:SetVehicleVelocity(vehicleid, x, y, z);
    }
    else if (!strcmp(command, "AddVehicleComponent"))
    {
        new vehicleid = Bridge_ParseIntArg(args, 0);
        new componentid = Bridge_ParseIntArg(args, 1);
        return AddVehicleComponent(vehicleid, componentid);
    }
    // Dialog
    else if (!strcmp(command, "ShowPlayerDialog"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new dialogid = Bridge_ParseIntArg(args, 1);
        new style = Bridge_ParseIntArg(args, 2);
        new title[64], body[512], button1[32], button2[32];
        Bridge_ParseStringArg(args, 3, title, sizeof(title));
        Bridge_ParseStringArg(args, 4, body, sizeof(body));
        Bridge_ParseStringArg(args, 5, button1, sizeof(button1));
        Bridge_ParseStringArg(args, 6, button2, sizeof(button2));
        return _:ShowPlayerDialog(playerid, dialogid, DIALOG_STYLE:style, title, body, button1, button2);
    }
    // Benchmark commands
    else if (!strcmp(command, "Ping"))
    {
        // Simple ping - returns the tick count for round-trip measurement
        return GetTickCount();
    }
    else if (!strcmp(command, "PingWithPayload"))
    {
        // Echo back a value to test with payload
        return Bridge_ParseIntArg(args, 0);
    }

    printf("[Bridge] Unknown command: %s", command);
    return 0;
}

// ------------------------------------
// Filterscript Entry Points
// ------------------------------------

public OnFilterScriptInit()
{
    print("[Bridge] =====================================");
    print("[Bridge] Bun IPC Bridge (Redis) v1.0");
    print("[Bridge] =====================================");

    // Delay connection to allow Redis to start
    SetTimer("Bridge_DelayedConnect", 2000, false);

    return 1;
}

forward Bridge_DelayedConnect();
public Bridge_DelayedConnect()
{
    Bridge_Connect();
    return 1;
}

public OnFilterScriptExit()
{
    if (gBridgeConnected)
    {
        Bridge_SendEvent("OnFilterScriptExit", "{}");
        Redis_Unsubscribe(gRedisSubscriber);
        Redis_Disconnect(gRedisPublisher);
    }
    print("[Bridge] Filterscript unloaded");
    return 1;
}

// ------------------------------------
// Game Events - Forward to Bun
// ------------------------------------

public OnPlayerConnect(playerid)
{
    new name[MAX_PLAYER_NAME], ip[16];
    GetPlayerName(playerid, name, sizeof(name));
    GetPlayerIp(playerid, ip, sizeof(ip));

    new escaped_name[MAX_PLAYER_NAME * 2];
    Bridge_EscapeJSON(name, escaped_name, sizeof(escaped_name));

    new payload[256];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"name\":\"%s\",\"ip\":\"%s\"}",
           playerid, escaped_name, ip);
    Bridge_SendEvent("OnPlayerConnect", payload);

    return 1;
}

public OnPlayerDisconnect(playerid, reason)
{
    new payload[64];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"reason\":%d}", playerid, reason);
    Bridge_SendEvent("OnPlayerDisconnect", payload);
    return 1;
}

public OnPlayerSpawn(playerid)
{
    new payload[32];
    format(payload, sizeof(payload), "{\"playerid\":%d}", playerid);
    Bridge_SendEvent("OnPlayerSpawn", payload);
    return 1;
}

public OnPlayerDeath(playerid, killerid, WEAPON:reason)
{
    new payload[64];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"killerid\":%d,\"reason\":%d}",
           playerid, killerid, _:reason);
    Bridge_SendEvent("OnPlayerDeath", payload);
    return 1;
}

public OnPlayerText(playerid, text[])
{
    new escaped[256];
    Bridge_EscapeJSON(text, escaped, sizeof(escaped));

    new payload[384];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"text\":\"%s\"}", playerid, escaped);
    Bridge_SendEvent("OnPlayerText", payload);
    return 1;
}

public OnPlayerCommandText(playerid, cmdtext[])
{
    new escaped[256];
    Bridge_EscapeJSON(cmdtext, escaped, sizeof(escaped));

    new payload[384];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"cmdtext\":\"%s\"}", playerid, escaped);
    Bridge_SendEvent("OnPlayerCommandText", payload);
    return 0;
}

public OnPlayerStateChange(playerid, PLAYER_STATE:newstate, PLAYER_STATE:oldstate)
{
    new payload[64];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"newstate\":%d,\"oldstate\":%d}",
           playerid, _:newstate, _:oldstate);
    Bridge_SendEvent("OnPlayerStateChange", payload);
    return 1;
}

public OnPlayerEnterVehicle(playerid, vehicleid, ispassenger)
{
    new payload[64];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"vehicleid\":%d,\"ispassenger\":%d}",
           playerid, vehicleid, ispassenger);
    Bridge_SendEvent("OnPlayerEnterVehicle", payload);
    return 1;
}

public OnPlayerExitVehicle(playerid, vehicleid)
{
    new payload[48];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"vehicleid\":%d}", playerid, vehicleid);
    Bridge_SendEvent("OnPlayerExitVehicle", payload);
    return 1;
}

public OnVehicleSpawn(vehicleid)
{
    new payload[32];
    format(payload, sizeof(payload), "{\"vehicleid\":%d}", vehicleid);
    Bridge_SendEvent("OnVehicleSpawn", payload);
    return 1;
}

public OnVehicleDeath(vehicleid, killerid)
{
    new payload[48];
    format(payload, sizeof(payload),
           "{\"vehicleid\":%d,\"killerid\":%d}", vehicleid, killerid);
    Bridge_SendEvent("OnVehicleDeath", payload);
    return 1;
}

public OnDialogResponse(playerid, dialogid, response, listitem, inputtext[])
{
    new escaped[256];
    Bridge_EscapeJSON(inputtext, escaped, sizeof(escaped));

    new payload[384];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"dialogid\":%d,\"response\":%d,\"listitem\":%d,\"inputtext\":\"%s\"}",
           playerid, dialogid, response, listitem, escaped);
    Bridge_SendEvent("OnDialogResponse", payload);
    return 0;
}

public OnPlayerTakeDamage(playerid, issuerid, Float:amount, WEAPON:weaponid, bodypart)
{
    new payload[96];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"issuerid\":%d,\"amount\":%.2f,\"weaponid\":%d,\"bodypart\":%d}",
           playerid, issuerid, amount, _:weaponid, bodypart);
    Bridge_SendEvent("OnPlayerTakeDamage", payload);
    return 1;
}

public OnPlayerGiveDamage(playerid, damagedid, Float:amount, WEAPON:weaponid, bodypart)
{
    new payload[96];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"damagedid\":%d,\"amount\":%.2f,\"weaponid\":%d,\"bodypart\":%d}",
           playerid, damagedid, amount, _:weaponid, bodypart);
    Bridge_SendEvent("OnPlayerGiveDamage", payload);
    return 1;
}

public OnPlayerClickMap(playerid, Float:fX, Float:fY, Float:fZ)
{
    new payload[96];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"x\":%.4f,\"y\":%.4f,\"z\":%.4f}",
           playerid, fX, fY, fZ);
    Bridge_SendEvent("OnPlayerClickMap", payload);
    return 1;
}

public OnPlayerEnterCheckpoint(playerid)
{
    new payload[32];
    format(payload, sizeof(payload), "{\"playerid\":%d}", playerid);
    Bridge_SendEvent("OnPlayerEnterCheckpoint", payload);
    return 1;
}

public OnPlayerLeaveCheckpoint(playerid)
{
    new payload[32];
    format(payload, sizeof(payload), "{\"playerid\":%d}", playerid);
    Bridge_SendEvent("OnPlayerLeaveCheckpoint", payload);
    return 1;
}

public OnPlayerRequestClass(playerid, classid)
{
    new payload[48];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"classid\":%d}", playerid, classid);
    Bridge_SendEvent("OnPlayerRequestClass", payload);
    return 1;
}

public OnPlayerRequestSpawn(playerid)
{
    new payload[32];
    format(payload, sizeof(payload), "{\"playerid\":%d}", playerid);
    Bridge_SendEvent("OnPlayerRequestSpawn", payload);
    return 1;
}
