#!/bin/bash
# Start pulseaudio in system mode — Railway containers run as root,
# and user-mode pulseaudio refuses to start as root.
# --system mode is designed for daemon/root usage.
pulseaudio --system --daemonize=true --disallow-exit=true \
  --disallow-module-loading=false || true
# Wait for pulseaudio to initialize
sleep 2
# Create a virtual null sink for Chrome to output to
pactl load-module module-null-sink \
  sink_name=VirtualSink sink_properties=device.description=VirtualSink \
  || true
pactl set-default-sink VirtualSink || true
# Set low-latency hint for Chrome audio pipeline
export PULSE_LATENCY_MSEC=30
# Start the bot server
exec node index.js
