#!/bin/bash
# Start pulseaudio in system mode — Railway containers run as root,
# and user-mode pulseaudio refuses to start as root.
pulseaudio --system --daemonize=true --disallow-exit=true \
  --disallow-module-loading=false || true
# Wait for pulseaudio to initialize
sleep 2
# System-mode pulseaudio uses a different socket than user mode.
# Set PULSE_SERVER so pactl connects to the right socket.
export PULSE_SERVER=unix:/var/run/pulse/native
# Create a virtual null sink for Chrome to output to
pactl load-module module-null-sink \
  sink_name=VirtualSink sink_properties=device.description=VirtualSink \
  || true
pactl set-default-sink VirtualSink || true
# Set low-latency hint for Chrome audio pipeline
export PULSE_LATENCY_MSEC=30
# Start the bot server (PULSE_SERVER and PULSE_LATENCY_MSEC are inherited by node)
exec node index.js
