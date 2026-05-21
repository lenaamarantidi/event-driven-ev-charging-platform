# stop and remove all points dbs containers
docker compose -f docker-compose.mariadb.points.yml down -v --remove-orphans

# kill running processes of node for points services
first_line=$(head -n 1 temp_nodes_pids.log)
kill $first_line
