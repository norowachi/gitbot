import { ChangeConsoleColor, DateInISO, env, sleep } from "./utils.js";
import { EventEmitter } from "events";

type methods = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export default class DiscordRestClient {
	private readonly token: string;
	private readonly emitter?: EventEmitter;
	// using nirn-proxy as the api endpoint
	private readonly baseUrl: string = env.DISCORD_API_URL;

	constructor(token: string, emitter?: EventEmitter) {
		this.token = token;
		this.emitter = emitter;
	}

	public async req(
		method: methods,
		endpoint: string,
		body?: any,
		timeout?: number,
		header?: { [key: string]: string }
	): Promise<any> {
		if (timeout) await sleep(timeout * 1.01);
		const url = `${this.baseUrl}${endpoint}`;

		const headers: Record<string, string> = {
			Authorization: `Bot ${this.token}`,
			"Content-Type": header
				? header["Content-Type"] || "application/json"
				: "application/json",
		};

		if (header)
			Object.entries(header).forEach(([k, v]) => {
				headers[k] = v;
			});

		const options: Record<string, any> = {
			method,
			headers,
			body: body
				? typeof body !== "string"
					? JSON.stringify(body)
					: body
				: undefined,
		};

		const result = await fetch(url, options);
		// json
		const json: any = (await result.json().catch((e) => {})) || {};
		// if hit rate limiy, retry after the time specified
		if (json.retry_after) {
			timeout =
				(parseInt(result.headers.get("Retry-After") || "0") ||
					json.retry_after) * 1000;
			if (this.emitter)
				this.emitter.emit(
					"debug-rest",
					DateInISO() +
						`${ChangeConsoleColor(
							"FgRed",
							"[REST]"
						)} METHOD: ${method}, TO: ${endpoint}, STATUS: RATELIMITED. RETRYING AFTER ${timeout}ms`
				);
			return this.req(method, endpoint, body, timeout);
		}

		if (this.emitter)
			this.emitter.emit(
				"debug-rest",
				DateInISO() +
					`${ChangeConsoleColor(
						"FgRed",
						"[REST]"
					)} METHOD: ${method}, TO: ${endpoint}, STATUS: ${result.status}`
			);

		return json;
	}
}
