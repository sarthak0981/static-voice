# Coturn Self-Hosted Production TURN/STUN Deployment

This directory contains the production configuration and Docker Compose setup for self-hosting a high-performance **Coturn** TURN/STUN relay server for `STATIC`.

## 1. Network & Port Requirements

Ensure the following ports are open in your host/cloud firewall (e.g. AWS Security Group / GCP Firewall / UFW):
- `3478 UDP/TCP`: Standard STUN/TURN port
- `443 TCP`: TURNS (TLS) port for strict corporate firewalls & deep packet inspection bypass
- `49152-65535 UDP`: Media relay port range

## 2. Configuration Steps

1. **DNS**: Point your domain (e.g. `turn.yourdomain.com`) to your server's public IP address.
2. **TLS Certificate**: Obtain a certificate using Let's Encrypt / Certbot:
   ```bash
   sudo certbot certonly --standalone -d turn.yourdomain.com
   ```
3. **Configure `turnserver.conf`**:
   - Set `realm=turn.yourdomain.com`
   - Set `static-auth-secret` to a high-entropy 32+ character random string:
     ```bash
     openssl rand -hex 32
     ```
   - Uncomment `external-ip` and set your server's public IPv4 address if running behind cloud NAT.
4. **Launch Coturn via Docker Compose**:
   ```bash
   docker compose up -d
   ```

## 3. STATIC Server Environment Configuration

In your `STATIC` backend `.env` file, configure the following variables:
```env
# Enables ephemeral time-limited HMAC credentials (coturn use-auth-secret scheme)
TURN_SHARED_SECRET=your_32_character_hex_auth_secret_here
TURN_HOST=turn.yourdomain.com
```

### Security Highlights
- **Private IP Denial**: Automatically blocks relay access to `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, and loopback interfaces to prevent SSRF vulnerabilities.
- **Short-Lived HMAC Tokens**: No persistent user credentials stored. Tokens expire automatically within 2 hours.
- **TURNS over 443**: Bypasses aggressive enterprise proxies and symmetric mobile NATs.
