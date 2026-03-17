# Runbook: Deployment Failure

## Symptoms
- GitHub Actions deploy job fails
- Container fails health/readiness checks
- Nginx configuration validation fails
- Blue-green switch incomplete

## Immediate Actions

### 1. Check Deployment Logs
```bash
# SSH to VPS
ssh $DO_USER@$DO_HOST

# Check recent deployment logs
cd /home/ashish/FieldTrack-2.0
tail -100 apps/api/.deploy_history

# Check container logs
docker logs backend-blue --tail 100
docker logs backend-green --tail 100
```

### 2. Verify Container Status
```bash
# Check running containers
docker ps -a | grep backend

# Check container health
docker inspect backend-blue | grep -A 10 Health
docker inspect backend-green | grep -A 10 Health
```

### 3. Check Readiness Dependencies
```bash
# Test Redis connectivity
redis-cli -u $REDIS_URL ping

# Test database connectivity (from container)
docker exec backend-blue curl -f http://localhost:3000/ready

# Check Supabase connectivity
curl -H "apikey: $SUPABASE_ANON_KEY" $SUPABASE_URL/rest/v1/
```

## Rollback Procedure

### Automatic Rollback
GitHub Actions automatically triggers rollback on deployment failure.

### Manual Rollback
```bash
cd /home/ashish/FieldTrack-2.0
chmod +x apps/api/scripts/rollback.sh
./apps/api/scripts/rollback.sh
```

## Root Cause Analysis

### Common Failure Modes

1. **Environment Variable Missing**
   - Check `.env` file completeness
   - Verify METRICS_SCRAPE_TOKEN in production
   - Validate DEPLOY_ROOT is set

2. **Database Migration Failure**
   - Check migration logs
   - Verify Supabase connection
   - Rollback migration if needed

3. **Redis Connection Failure**
   - Verify Redis container running
   - Check REDIS_URL format
   - Test connectivity from app container

4. **Image Pull Failure**
   - Verify GitHub Container Registry access
   - Check image tag exists
   - Validate network connectivity

5. **Nginx Configuration Error**
   - Check template substitution
   - Verify API_DOMAIN set correctly
   - Test nginx config: `sudo nginx -t`

## Prevention

- Always test in staging first
- Run smoke tests before production deploy
- Monitor deployment metrics
- Keep rollback history (last 5 deployments)
- Set DEPLOY_ROOT environment variable

## Escalation

If rollback fails or issue persists:
1. Check monitoring dashboard: https://api.fieldtrack.meowsician.tech/monitor/
2. Review Loki logs for errors
3. Contact DevOps team
4. Consider manual container restart as last resort
