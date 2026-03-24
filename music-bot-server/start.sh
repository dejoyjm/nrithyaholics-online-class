#!/bin/bash
# Start pulseaudio virtual audio sink
pulseaudio --start --exit-idle-time=-1 --daemonize=true
# Wait for pulseaudio to initialize
sleep 2
# Create a virtual null sink for Chrome to output to
pactl load-module module-null-sink sink_name=VirtualSink || true
pactl set-default-sink VirtualSink || true
# Set low-latency hint for Chrome audio pipeline
export PULSE_LATENCY_MSEC=30
# Start the bot server
exec node index.js
