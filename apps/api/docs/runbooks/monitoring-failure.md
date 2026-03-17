# Runbook: Monitoring Stack Failure

## Symptoms
- Grafana dashboard unreachable
- Prometheus not scraping metrics
- Loki logs not appearing
- Alerts not firing

## Immediate Actions

### 1. Check Monitoring Containers
```bash
# Check all monitoring containers
docker ps | grep -E "prometheus|grafana|loki|promtail"

# Check container logs
docker logs prometheus --tail 50
docker logs grafana --tail 50
docker logs loki --tail 50
docker logs promtail --tail 50
```

### 2. Verify Network Connectivity
```bash
# Check fieldtrack_network exists
docker network ls | grep fieldtrack

# Verify containers on network
docker network inspect fieldtrack_network | grep Name
```

### 3. Test Individual Components
```bash
# Test Prometheus
curl http://localhost:9090/-/healthy

# Test Grafana
curl http://localhost:3333/api/health

# Test Loki
curl http://localhost:3100/ready

# Test backend metrics endpoint
curl -H "Authorization: Bearer $METRICS_SCRAPE_TOKEN" http://localhost:3001/metrics
```

## Recovery Procedures

### Restart Monitoring Stack
```bash
cd /home/ashish/FieldTrack-2.0/infra

# Stop all monitoring containers
docker compose --env-file .env.monitoring -f docker-compose.monitoring.yml down

# Start fresh
docker compose --env-file .env.monitoring -f docker-compose.monitoring.yml up -d

# Verify startup
docker compose --env-file .env.monitoring -f docker-compose.monitoring.yml ps
```

### Restart Individual Service

#### Prometheus
```bash
docker restart prometheus

# Verify scrape targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'
```

#### Grafana
```bash
docker restart grafana

# Check datasources
curl -u admin:$GRAFANA_PASSWORD http://localhost:3333/api/datasources
```

#### Loki
```bash
docker restart loki

# Test log ingestion
curl http://localhost:3100/loki/api/v1/labels
```

#### Promtail
```bash
docker restart promtail

# Check targets
curl http://localhost:9080/targets
```

## Root Cause Analysis

### Common Issues

1. **Prometheus Not Scraping**
   ```bash
   # Check scrape config
   docker exec prometheus cat /etc/prometheus/prometheus.yml
   
   # Verify METRICS_SCRAPE_TOKEN matches
   grep METRICS_SCRAPE_TOKEN infra/.env.monitoring
   
   # Check backend metrics endpoint
   curl -H "Authorization: Bearer $METRICS_SCRAPE_TOKEN" http://backend-blue:3000/metrics
   ```

2. **Grafana Datasource Failure**
   ```bash
   # Check Grafana logs for datasource errors
   docker logs grafana | grep -i "datasource"
   
   # Verify Prometheus URL in Grafana
   # Should be: http://prometheus:9090
   
   # Verify Loki URL in Grafana
   # Should be: http://loki:3100
   ```

3. **Loki Not Receiving Logs**
   ```bash
   # Check Promtail is running
   docker ps | grep promtail
   
   # Verify Promtail config
   docker exec promtail cat /etc/promtail/promtail.yml
   
   # Check Promtail can reach Loki
   docker exec promtail wget -O- http://loki:3100/ready
   ```

4. **Disk Space Full**
   ```bash
   # Check disk usage
   df -h
   
   # Check Prometheus data size
   du -sh infra/prometheus/data/
   
   # Check Loki data size
   du -sh infra/loki/
   
   # Clean old data if needed (Loki has 30d retention)
   ```

5. **Configuration Drift**
   ```bash
   # Verify config hash
   cat ~/.fieldtrack-monitoring-hash
   
   # Force config reload
   rm ~/.fieldtrack-monitoring-hash
   cd /home/ashish/FieldTrack-2.0
   export DEPLOY_ROOT=/home/ashish/FieldTrack-2.0
   ./apps/api/scripts/deploy-bluegreen.sh $(head -1 apps/api/.deploy_history)
   ```

## Configuration Validation

### Prometheus
```bash
# Validate prometheus.yml
docker run --rm -v $(pwd)/infra/prometheus:/prometheus prom/prometheus:latest \
  promtool check config /prometheus/prometheus.yml

# Validate alerts.yml
docker run --rm -v $(pwd)/infra/prometheus:/prometheus prom/prometheus:latest \
  promtool check rules /prometheus/alerts.yml
```

### Loki
```bash
# Validate loki-config.yaml
docker run --rm -v $(pwd)/infra/loki:/loki grafana/loki:2.9.6 \
  -config.file=/loki/loki-config.yaml -verify-config
```

### Promtail
```bash
# Validate promtail.yml
docker run --rm -v $(pwd)/infra/promtail:/promtail grafana/promtail:2.9.6 \
  -config.file=/promtail/promtail.yml -dry-run
```

## Data Recovery

### Prometheus Data Loss
```bash
# Prometheus stores 15 days by default
# Data is in infra/prometheus/data/
# If corrupted, stop Prometheus and delete data dir
docker stop prometheus
rm -rf infra/prometheus/data/*
docker start prometheus
# Metrics will rebuild from current scrapes
```

### Loki Data Loss
```bash
# Loki stores 30 days (configured in loki-config.yaml)
# Data is in infra/loki/chunks/
# If corrupted, stop Loki and delete chunks
docker stop loki
rm -rf infra/loki/chunks/*
docker start loki
# Logs will rebuild from Promtail
```

### Grafana Dashboard Loss
```bash
# Dashboards are in infra/grafana/dashboards/
# If lost, restore from git
cd /home/ashish/FieldTrack-2.0
git checkout infra/grafana/dashboards/
docker restart grafana
```

## Prevention

### Regular Maintenance
```bash
# Weekly: Check disk space
df -h

# Weekly: Verify all targets healthy
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'

# Monthly: Review retention policies
# Prometheus: 15d default
# Loki: 30d configured
```

### Monitoring the Monitors
- Set up external uptime monitoring for Grafana
- Configure Prometheus to alert on its own health
- Document baseline resource usage

### Backup Strategy
```bash
# Backup Grafana dashboards
cp -r infra/grafana/dashboards/ ~/backups/grafana-$(date +%Y%m%d)/

# Backup Prometheus config
cp infra/prometheus/*.yml ~/backups/prometheus-$(date +%Y%m%d)/

# Backup Loki config
cp infra/loki/*.yaml ~/backups/loki-$(date +%Y%m%d)/
```

## Escalation

If monitoring cannot be restored:
1. Application continues running (monitoring is non-critical)
2. Check GitHub Actions logs for deployment issues
3. Review recent infrastructure changes
4. Consider fresh monitoring stack deployment
5. Engage DevOps team if data corruption suspected
