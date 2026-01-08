#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

case "$1" in
    start)
        docker compose -f "$COMPOSE_FILE" up -d
        ;;
    stop)
        docker compose -f "$COMPOSE_FILE" down
        ;;
    restart)
        docker compose -f "$COMPOSE_FILE" restart
        ;;
    rebuild)
        docker compose -f "$COMPOSE_FILE" up -d --build
        ;;
    logs)
        docker compose -f "$COMPOSE_FILE" logs -f
        ;;
    status)
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    attach)
        docker attach omp-server
        ;;
    exec)
        shift
        docker exec -it omp-server "$@"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|rebuild|logs|status|attach|exec}"
        echo ""
        echo "Commands:"
        echo "  start    Start the server"
        echo "  stop     Stop the server"
        echo "  restart  Restart the server"
        echo "  rebuild  Rebuild and start (after changing components)"
        echo "  logs     Follow server logs"
        echo "  status   Show container status"
        echo "  attach   Attach to server console (detach: Ctrl+P, Ctrl+Q)"
        echo "  exec     Execute command in container (e.g., ./server.sh exec ls)"
        exit 1
        ;;
esac
