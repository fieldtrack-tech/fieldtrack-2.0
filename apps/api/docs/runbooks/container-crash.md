# Runbook: Container Crash

## Symptoms
- Backend container stops unexpectedly
- 502 Bad Gateway errors from Nginx
- Prometheus shows container down
- Health checks failing

## Immediate Actions

### 1. Identify Crashed Container
```bash
# Check container status
docker ps -a | grep backend

# Get exit code and status
docker inspect backend-blue --format='{{.State.ExitCode}} {{.State.Status}}'
docker inspect backend-green --format='{{.State.ExitCode}} {{.State.Status}}'
```

### 2. Retrieve Crash Logs
```bash
# Get last 200 lines before crash
docker logs backend-blue --tail 200 > /tmp/crash-blue.log
docker logs backend-green --tail 200 > /tmp/crash-green.log

# Check for OOM kills
dmesg | grep -i "out of memory"
dmesg | grep -i "killed process"
```

### 3. Check System Resources
```bash
# Memory usage
free -h
docker stats --no-stream

# Disk space
df -h

# CPU load
uptime
top -bn1 | head -20
```

## Recovery Procedure

### Quick Recovery (Restart Container)
```bash
# Restart the crashed container
docker restart backend-blue  # or backend-green

# Wait for health check
for i in {1..30}; do
  curl -f http://localhost:3001/ready && break || sleep 2
done
```

### Full Recovery (Redeploy)
```bash
cd /home/ashish/FieldTrack-2.0
export DEPLOY_ROOT=/home/ashish/FieldTrack-2.0

# Get current deployment SHA
CURRENT_SHA=$(head -1 apps/api/.deploy_history)

# Redeploy current version
./apps/api/scripts/deploy-bluegreen.sh "$CURRENT_SHA"
```

## Root Cause Analysis

### Exit Code Meanings
- **0**: Clean shutdown (rare for crash)
- **1**: Application error (check logs)
- **137**: OOM killed (out of memory)
- **139**: Segmentation fault
- **143**: SIGTERM (manual stop)

### Common Crash Causes

1. **Out of Memory (Exit 137)**
   ```bash
   # Check memory limits
   docker inspect backend-blue | grep -i memory
   
   # Increase memory limit if needed
   # Edit docker run command in deploy script
   ```

2. **Unhandled Exception**
   - Check application logs for stack traces
   - Look for "Unhandled error" messages
   - Verify database connectivity

3. **Database Connection Loss**
   ```bash
   # Test Supabase connectivity
   curl -H "apikey: $SUPABASE_ANON_KEY" $SUPABASE_URL/rest/v1/
   
   # Check connection pool exhaustion in logs
   grep "connection pool" /tmp/crash-*.log
   ```

4. **Redis Connection Loss**
   ```bash
   # Check Redis status
   docker ps | grep redis
   redis-cli -u $REDIS_URL ping
   
   # Check BullMQ connection errors
   grep "Redis connection" /tmp/crash-*.log
   ```

5. **Worker Queue Saturation**
   ```bash
   # Check queue depths
   redis-cli -u $REDIS_URL llen bull:distance:wait
   redis-cli -u $REDIS_URL llen bull:analytics:wait
   
   # If > MAX_QUEUE_DEPTH, drain queue
   ```

## Prevention

### Monitoring
- Set up Prometheus alerts for container down
- Monitor memory usage trends
- Track error rates before crashes

### Configuration
- Set appropriate memory limits
- Configure restart policy: `--restart unless-stopped`
- Enable Docker healthcheck
- Set METRICS_SCRAPE_TOKEN in production

### Code Quality
- Add error boundaries for async operations
- Implement graceful shutdown handlers
- Add circuit breakers for external services
- Log all unhandled rejections

## Post-Incident

1. **Preserve Evidence**
   ```bash
   # Save logs
   cp /tmp/crash-*.log ~/incident-$(date +%Y%m%d-%H%M%S)/
   
   # Save container state
   docker inspect backend-blue > ~/incident-*/inspect.json
   ```

2. **Update Monitoring**
   - Add alert for specific error pattern
   - Adjust thresholds if needed
   - Document in incident log

3. **Code Fix**
   - Create GitHub issue with logs
   - Add test case to prevent recurrence
   - Deploy fix through normal CI/CD

## Escalation

If crashes persist after recovery:
1. Check Grafana dashboard for patterns
2. Review recent code changes
3. Consider rolling back to last stable version
4. Engage development team for debugging
