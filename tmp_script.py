from pathlib import Path
p = Path('architecture/COMPONENT_DIAGRAM.md')
text = p.read_text()
print(repr(text[text.index('      component "API Gateway\nService: api-gateway\nPort: 4411" as ApiGatewayService'):text.index('      component "API Gateway\nService: api-gateway\nPort: 4411" as ApiGatewayService')+100]))
