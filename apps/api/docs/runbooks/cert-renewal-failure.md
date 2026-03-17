# Runbook: TLS Certificate Renewal Failure

## Symptoms
- Certificate expiry alert firing
- Browser shows "Your connection is not private"
- Certbot renewal fails
- HTTPS connections rejected

## Immediate Actions

### 1. Check Certificate Status
```bash
# Check certificate expiry
sudo certbot certificates

# Check specific domain
echo | openssl s_client -servername api.fieldtrack.meowsician.tech \
  -connect api.fieldtrack.meowsician.tech:443 2>/dev/null | \
  openssl x509 -noout -dates

# Check days until expiry
echo | openssl s_client -servername api.fieldtrack.meowsician.tech \
  -connect api.fieldtrack.meowsician.tech:443 2>/dev/null | \
  openssl x509 -noout -enddate
```

### 2. Check Certbot Logs
```bash
# View recent renewal attempts
sudo tail -100 /var/log/letsencrypt/letsencrypt.log

# Check for errors
sudo grep -i error /var/log/letsencrypt/letsencrypt.log | tail -20
```

### 3. Verify ACME Challenge Access
```bash
# Test .well-known/acme-challenge is accessible
curl -I http://api.fieldtrack.meowsician.tech/.well-known/acme-challenge/test

# Should return 404 (not 403 or 502)
# 403 = blocked by nginx
# 502 = nginx misconfigured
```

## Manual Renewal

### Standard Renewal
```bash
# Dry run first (test without actually renewing)
sudo certbot renew --dry-run

# If dry run succeeds, do actual renewal
sudo certbot renew

# Reload nginx to use new certificate
sudo systemctl reload nginx
```

### Force Renewal (if cert not yet expired)
```bash
# Force renewal even if not due
sudo certbot renew --force-renewal

# Reload nginx
sudo systemctl reload nginx
```

### Interactive Renewal (if automated fails)
```bash
# Stop nginx temporarily
sudo systemctl stop nginx

# Run certbot standalone
sudo certbot certonly --standalone \
  -d api.fieldtrack.meowsician.tech \
  --email your-email@example.com \
  --agree-tos

# Start nginx
sudo systemctl start nginx
```

## Root Cause Analysis

### Common Failure Modes

1. **ACME Challenge Blocked**
   ```bash
   # Check nginx config allows .well-known
   sudo nginx -T | grep -A 5 "well-known"
   
   # Should have:
   # location /.well-known/acme-challenge/ {
   #     root /var/www/certbot;
   # }
   
   # Verify directory exists and is writable
   ls -la /var/www/certbot/.well-known/acme-challenge/
   ```

2. **DNS Issues**
   ```bash
   # Verify DNS resolves correctly
   dig api.fieldtrack.meowsician.tech +short
   
   # Should return your VPS IP
   # If not, update DNS records
   ```

3. **Rate Limiting**
   ```bash
   # Let's Encrypt has rate limits:
   # - 5 failed validations per hour
   # - 50 certificates per domain per week
   
   # Check if rate limited
   sudo grep "rate limit" /var/log/letsencrypt/letsencrypt.log
   
   # If rate limited, wait and try again later
   ```

4. **Firewall Blocking Port 80**
   ```bash
   # Check port 80 is open
   sudo ufw status | grep 80
   
   # Should show:
   # 80/tcp ALLOW Anywhere
   
   # If blocked, allow it
   sudo ufw allow 80/tcp
   ```

5. **Certbot Service Not Running**
   ```bash
   # Check certbot timer
   sudo systemctl status certbot.timer
   
   # If inactive, enable it
   sudo systemctl enable certbot.timer
   sudo systemctl start certbot.timer
   ```

## Certificate Validation

### Verify New Certificate
```bash
# Check certificate details
sudo openssl x509 -in /etc/letsencrypt/live/api.fieldtrack.meowsician.tech/fullchain.pem \
  -noout -text | grep -A 2 "Validity"

# Verify certificate chain
sudo openssl verify -CAfile /etc/letsencrypt/live/api.fieldtrack.meowsician.tech/chain.pem \
  /etc/letsencrypt/live/api.fieldtrack.meowsician.tech/cert.pem

# Test HTTPS connection
curl -vI https://api.fieldtrack.meowsician.tech 2>&1 | grep -i "SSL certificate"
```

### Browser Test
```bash
# Test from external location
curl -I https://api.fieldtrack.meowsician.tech

# Check SSL Labs rating (optional)
# https://www.ssllabs.com/ssltest/analyze.html?d=api.fieldtrack.meowsician.tech
```

## Prevention

### Automated Renewal
```bash
# Certbot should auto-renew via systemd timer
# Verify timer is active
sudo systemctl list-timers | grep certbot

# Should show next run time
# Certbot renews certs 30 days before expiry
```

### Monitoring
```bash
# Add Prometheus alert for certificate expiry
# Already configured in infra/prometheus/alerts.yml
# Alert fires when cert expires in < 7 days
```

### Pre-Renewal Hook
```bash
# Create pre-renewal hook to stop nginx if needed
sudo nano /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh

#!/bin/bash
# Only stop nginx if using standalone mode
# Not needed for webroot mode (default)

# Make executable
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh
```

### Post-Renewal Hook
```bash
# Create post-renewal hook to reload nginx
sudo nano /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh

#!/bin/bash
systemctl reload nginx

# Make executable
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh
```

## Emergency Procedures

### Certificate Expired (Downtime Acceptable)
```bash
# Stop nginx
sudo systemctl stop nginx

# Remove old certificate
sudo certbot delete --cert-name api.fieldtrack.meowsician.tech

# Get new certificate (standalone)
sudo certbot certonly --standalone \
  -d api.fieldtrack.meowsician.tech \
  --email your-email@example.com \
  --agree-tos

# Start nginx
sudo systemctl start nginx
```

### Certificate Expired (Zero Downtime Required)
```bash
# Use webroot mode (nginx stays running)
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d api.fieldtrack.meowsician.tech \
  --email your-email@example.com \
  --agree-tos

# Reload nginx
sudo systemctl reload nginx
```

## Backup Certificates

### Export Current Certificates
```bash
# Create backup directory
mkdir -p ~/cert-backup-$(date +%Y%m%d)

# Copy certificates
sudo cp -r /etc/letsencrypt/live/api.fieldtrack.meowsician.tech/ \
  ~/cert-backup-$(date +%Y%m%d)/

sudo cp -r /etc/letsencrypt/archive/api.fieldtrack.meowsician.tech/ \
  ~/cert-backup-$(date +%Y%m%d)/archive/

# Copy renewal config
sudo cp /etc/letsencrypt/renewal/api.fieldtrack.meowsician.tech.conf \
  ~/cert-backup-$(date +%Y%m%d)/
```

### Restore Certificates
```bash
# Stop nginx
sudo systemctl stop nginx

# Restore from backup
sudo cp -r ~/cert-backup-YYYYMMDD/api.fieldtrack.meowsician.tech/ \
  /etc/letsencrypt/live/

sudo cp -r ~/cert-backup-YYYYMMDD/archive/ \
  /etc/letsencrypt/archive/api.fieldtrack.meowsician.tech/

sudo cp ~/cert-backup-YYYYMMDD/api.fieldtrack.meowsician.tech.conf \
  /etc/letsencrypt/renewal/

# Start nginx
sudo systemctl start nginx
```

## Escalation

If certificate renewal continues to fail:
1. Check Let's Encrypt status page: https://letsencrypt.status.io/
2. Verify domain ownership and DNS records
3. Consider using alternative ACME client (acme.sh)
4. Contact Let's Encrypt support if rate limited
5. Consider purchasing commercial certificate as temporary solution

## Post-Incident

1. **Document Root Cause**
   - What caused the failure?
   - How was it detected?
   - How long was the outage?

2. **Update Monitoring**
   - Ensure certificate expiry alert is working
   - Set alert threshold to 14 days (not 7)
   - Add alert for renewal failures

3. **Improve Automation**
   - Verify certbot timer is enabled
   - Test renewal process in staging
   - Document manual renewal procedure

4. **Communication**
   - Notify users if there was downtime
   - Update status page
   - Create incident report
