aws ecs run-task --cluster "arn:aws:ecs:ap-southeast-2:843407916570:cluster/RemsStack-IsolatedCluster81095178-AGX4I7Cwh6Fi" \
     --enable-execute-command \
     --task-definition RemsStackIsolatedServiceTaskDef44F18B6A:11 \
     --overrides '{ "containerOverrides": [ { "name": "web", "environment": [ { "name": "CMD", "value": "migrate" } ] } ] }' \
     --launch-type 'FARGATE' \
     --network-configuration '{ "awsvpcConfiguration": { "subnets": ["subnet-0dc5bedc2bd108b80"], "securityGroups": ["sg-023673ca42e90fc6a"] } }'
