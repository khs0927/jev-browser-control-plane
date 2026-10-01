"""Private GitHub OAuth using the upstream FastMCP provider, no custom OAuth flow."""
import os
import logging
from urllib.parse import urlparse
from fastmcp import FastMCP
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl
from fastmcp.server.auth.providers.github import GitHubProvider
from server import create_mcp

OWNER_ID = '130247531'

# Public OAuth metadata observed from this owner's existing ChatGPT connector.
# Restore only this registration after an ephemeral deployment loses its disk.
CHATGPT_CLIENT_ID = "fff52a72-eef8-4216-a1ca-8698912fd1a1"
CHATGPT_CALLBACK = "https://chatgpt.com/connector/oauth/GDFZSoa7auNs"

class OwnerGitHubProvider(GitHubProvider):
    async def get_client(self, client_id):
        client = await super().get_client(client_id)
        if client is not None or client_id != CHATGPT_CLIENT_ID:
            return client
        await self.register_client(OAuthClientInformationFull(
            client_id=CHATGPT_CLIENT_ID,
            client_name="ChatGPT JEV Decision MCP",
            redirect_uris=[AnyUrl(CHATGPT_CALLBACK)],
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"], scope="read:user",
            token_endpoint_auth_method="none",
        ))
        return await super().get_client(client_id)

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
        allowed_client_redirect_uris=[
            'https://chatgpt.com/connector/oauth/*',
            'https://manufact.com/inspector/oauth/callback'],
        require_authorization_consent=True)
    mcp = create_mcp(instance=FastMCP('JEV Decision Plugin',auth=auth,mask_error_details=True))
    @mcp.custom_route('/health',methods=['GET'])
    async def health(request):
        from starlette.responses import JSONResponse
        return JSONResponse({'status':'running','mcp_ready':True})
    return mcp.http_app(path='/mcp',stateless_http=True,json_response=True,
        allowed_hosts=[resource.netloc,'localhost:*','127.0.0.1:*'],
        allowed_origins=[base,'https://chatgpt.com'])
