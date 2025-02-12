import fetch, { Response, Request, Headers } from 'node-fetch';

global.fetch = fetch;
global.Response = Response;
global.Request = Request;
global.Headers = Headers;




