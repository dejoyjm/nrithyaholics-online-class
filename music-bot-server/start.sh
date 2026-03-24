#!/bin/bash
# Start pulseaudio in system mode (Railway runs as root; user mode refuses root)
pulseaudio --system --daemonize=true --disallow-exit=true --disallow-module-loading=false || true
sleep 2
# System mode socket is /var/run/pulse/native — pass --server directly to avoid PULSE_SERVER env issues
pactl --server unix:/var/run/pulse/native load-module module-null-sink sink_name=VirtualSink sink_properties=device.description=VirtualSink || true
pactl --server unix:/var/run/pulse/native set-default-sink VirtualSink || true
# Inherit these into node/Chrome
export PULSE_SERVER=unix:/var/run/pulse/native
export PULSE_LATENCY_MSEC=30
exec node index.js
