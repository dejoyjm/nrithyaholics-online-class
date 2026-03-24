#!/bin/bash
# PULSE_DAEMON_NO_ROOT_CHECK=1 bypasses user-mode pulseaudio's root refusal.
# System mode was tried but its socket is restricted to the pulse-access group,
# which root is not in by default. User mode + no-root-check is simpler.
export PULSE_DAEMON_NO_ROOT_CHECK=1
pulseaudio --start --exit-idle-time=-1 --daemonize=true
sleep 2
pactl load-module module-null-sink sink_name=VirtualSink sink_properties=device.description=VirtualSink || true
pactl set-default-sink VirtualSink || true
export PULSE_LATENCY_MSEC=30
exec node index.js
