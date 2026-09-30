"""Hosted entry point: health checks stay available; unconfigured MCP fails closed."""
import os
import uvicorn
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route


def app():
    async def health(request):
        return JSONResponse({'status':'running', 'mcp_ready': False})
    async def blocked(request):
        return JSONResponse({'error':'oauth_not_configured'}, status_code=503)
    try:
        if os.getenv('JEV_AUTH_PROVIDER') == 'github':
            from github_auth import github_app
            return github_app()
        from server import http_server
        mcp = http_server()
    except RuntimeError:
        return Starlette(routes=[Route('/health', health), Route('/{path:path}', blocked, methods=['GET','POST','DELETE'])])
    @mcp.custom_route('/health', methods=['GET'])
    async def ready_health(request):
        return JSONResponse({'status':'running', 'mcp_ready': True})
    return mcp.streamable_http_app()

if __name__ == '__main__':
    uvicorn.run(app(), host=os.getenv('JEV_BIND_HOST','127.0.0.1'), port=int(os.getenv('PORT','8080')))
