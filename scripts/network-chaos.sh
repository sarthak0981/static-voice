#!/usr/bin/env bash
# STATIC WebRTC Network Chaos Testing Script
# Simulates packet loss, jitter, and bandwidth limits using Linux Traffic Control (tc / netem)
#
# Usage:
#   sudo ./scripts/network-chaos.sh apply [loss_percent] [jitter_ms] [rate_kbps]
#   sudo ./scripts/network-chaos.sh clear
#   sudo ./scripts/network-chaos.sh status

INTERFACE="${STATIC_NET_INTERFACE:-lo}"
ACTION="${1:-status}"
LOSS="${2:-10%}"
JITTER="${3:-30ms}"
RATE="${4:-350kbit}"

set -e

case "$ACTION" in
  apply)
    echo "=========================================================="
    echo "Applying Network Chaos on interface: $INTERFACE"
    echo "Packet Loss: $LOSS"
    echo "Jitter:      $JITTER"
    echo "Rate Limit:  $RATE"
    echo "=========================================================="
    # Clear existing rules on interface
    sudo tc qdisc del dev "$INTERFACE" root 2>/dev/null || true
    # Apply netem rules
    sudo tc qdisc add dev "$INTERFACE" root handle 1: netem loss "$LOSS" delay 50ms "$JITTER" rate "$RATE"
    echo "Chaos applied successfully. Run tests now."
    ;;

  clear)
    echo "Clearing network chaos rules on: $INTERFACE"
    sudo tc qdisc del dev "$INTERFACE" root 2>/dev/null || true
    echo "Network restored to normal."
    ;;

  status)
    echo "Current tc qdisc rules on $INTERFACE:"
    sudo tc qdisc show dev "$INTERFACE"
    ;;

  *)
    echo "Usage: $0 {apply|clear|status} [loss%] [jitter_ms] [rate_kbps]"
    exit 1
    ;;
esac
