FROM --platform=linux/amd64 ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Enable 32-bit architecture support
RUN dpkg --add-architecture i386

# Update and install dependencies
RUN apt-get update && apt-get install -y \
    libatomic1 \
    libatomic1:i386 \
    libc6:i386 \
    libstdc++6:i386 \
    libssl3:i386 \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Create server directory
WORKDIR /opt/omp-server

# Copy server files
COPY omp-server ./
COPY config.json ./
COPY bans.json ./
COPY components/ ./components/
COPY plugins/ ./plugins/
COPY gamemodes/ ./gamemodes/
COPY filterscripts/ ./filterscripts/
COPY npcmodes/ ./npcmodes/
COPY scriptfiles/ ./scriptfiles/
COPY models/ ./models/
COPY qawno/ ./qawno/

# Make pawn compiler executable (compilation happens at startup via start.sh)
RUN chmod +x qawno/pawncc

# Copy and install Bun bridge
COPY bun-bridge/ ./bun-bridge/
WORKDIR /opt/omp-server/bun-bridge
RUN bun install --frozen-lockfile || bun install

WORKDIR /opt/omp-server

# Make server executable
RUN chmod +x omp-server

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Expose ports
EXPOSE 7777/udp

# Run the startup script
CMD ["./start.sh"]
