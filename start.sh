#!/bin/bash

echo "========================================"
echo "  Starting open.mp + Bun Bridge"
echo "========================================"

# Compile filterscripts (allows editing without rebuild)
echo "[Startup] Compiling filterscripts..."
cd /opt/omp-server
for pwn_file in filterscripts/*.pwn; do
    if [ -f "$pwn_file" ]; then
        base_name=$(basename "$pwn_file" .pwn)
        LD_LIBRARY_PATH=./qawno ./qawno/pawncc "$pwn_file" -ofilterscripts/"$base_name".amx -i./qawno/include -d0
        if [ $? -eq 0 ]; then
            echo "[Startup] $base_name.pwn compiled successfully"
        else
            echo "[Startup] WARNING: $base_name.pwn compilation failed"
        fi
    fi
done

# Start Bun bridge in background
echo "[Startup] Starting Bun bridge server..."
cd /opt/omp-server/bun-bridge
bun run src/index.ts &
BUN_PID=$!

# Wait for Bun to initialize
sleep 2

# Check if Bun started successfully
if ! kill -0 $BUN_PID 2>/dev/null; then
    echo "[Startup] ERROR: Bun bridge failed to start"
    exit 1
fi

echo "[Startup] Bun bridge started (PID: $BUN_PID)"

# Start open.mp server in foreground
echo "[Startup] Starting open.mp server..."
cd /opt/omp-server
./omp-server

# When omp-server exits, kill Bun
echo "[Startup] open.mp server stopped, shutting down Bun..."
kill $BUN_PID 2>/dev/null
wait $BUN_PID 2>/dev/null

echo "[Startup] Shutdown complete"
