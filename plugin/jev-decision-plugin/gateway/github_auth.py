"""Private GitHub OAuth using the upstream FastMCP provider, no custom OAuth flow."""
import os
import logging
from urllib.parse import urlparse
from fastmcp import FastMCP
from fastmcp.server.auth.providers.github import GitHubProvider
from server import create_mcp

OWNER_ID = '130247531'

class OwnerGitHubProvider(GitHubProvider):
    async def register_client(self, client_info):
        try:
            return await super().register_client(client_info)
        except Exception:
            for uri in client_info.redirect_uris or []:
                parsed = urlparse(str(uri))
                logging.getLogger(__name__).warning(
                    'OAuth client registration rejected; callback=%s://%s%s',
                    parsed.scheme, parsed.hostname, parsed.path)
            raise

    async def load_access_token(self, token):
        verified = await super().load_access_token(token)
        if verified is None or str((verified.claims or {}).get('sub','')) != OWNER_ID:
            return None
        return verified


def github_app():
    required = ['JEV_GITHUB_CLIENT_ID','JEV_GITHUB_CLIENT_SECRET','JEV_RESOURCE_URL']
    if any(not os.getenv(k) for k in required):
        raise RuntimeError('GitHub OAuth configuration required')
    resource = urlparse(os.environ['JEV_RESOURCE_URL'])
    if resource.scheme != 'https' or not resource.netloc or resource.username or resource.password:
        raise RuntimeError('HTTPS resource required')
    base = f'{resource.scheme}://{resource.netloc}'
    auth = OwnerGitHubProvider(
        client_id=os.environ['JEV_GITHUB_CLIENT_ID'],
        client_secret=os.environ['JEV_GITHUB_CLIENT_SECRET'],
        base_url=base, required_scopes=['read:user'],
        allowed_client_redirect_uris=['https://chatgpt.com/connector/oauth/*'],
        require_authorization_consent=True)
    mcp = create_mcp(instance=FastMCP('JEV Decision Plugin',auth=auth,mask_error_details=True))
    @mcp.custom_route('/health',methods=['GET'])
    async def health(request):
        from starlette.responses import JSONResponse
        return JSONResponse({'status':'running','mcp_ready':True})
    return mcp.http_app(path='/mcp',stateless_http=True,json_response=True,
        allowed_hosts=[resource.netloc,'localhost:*','127.0.0.1:*'],
        allowed_origins=[base,'https://chatgpt.com'])
