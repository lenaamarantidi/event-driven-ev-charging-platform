# stop and remove all points dbs containers
docker compose -f docker-compose.mariadb.points.yml down -v --remove-orphans

docker compose -f docker-compose.points.services.yml down -v --remove-orphans
