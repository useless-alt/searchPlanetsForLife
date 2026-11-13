import { handleProxyRequest } from './proxy-handler';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return handleProxyRequest(request);
}
