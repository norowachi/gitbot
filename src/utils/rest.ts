import { env } from "./utils.js";
import { ChangeConsoleColor, DateInISO, sleep } from "@utils";
import axios, {
	RawAxiosRequestHeaders,
	Method,
	AxiosHeaders,
	AxiosError,
} from "axios";
import { EventEmitter } from "node:events";
import { inspect } from "node:util";

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

	async req(
		method: methods,
		endpoint: string,
		data?: {
			body?: any;
			headers?:
				| (RawAxiosRequestHeaders &
						Partial<
							{
								[Key in Method as Lowercase<Key>]: AxiosHeaders;
							} & {
								common: AxiosHeaders;
							}
						>)
				| AxiosHeaders;
		},
		timeout?: number
	): Promise<any> {
		let { body } = data || {};
		let headers = data?.headers || {};

		if (timeout) await sleep(timeout * 1.01);
		const url = `${this.baseUrl}${endpoint}`;

		headers["User-Agent"] = "norowa.dev";
		headers["Authorization"] = `Bot ${this.token}`;
		if (!headers["Content-Type"])
			headers["Content-Type"] = "application/json";

		// send the req
		const result = await axios({
			method,
			url,
			headers,
			data: body,
		}).catch((e: AxiosError) => {
			console.error(inspect(e.response?.data, { depth: Infinity }));
		});

		if (!result) return;

		// json
		const json: any = result.data || {};
		// if hit rate limiy, retry after the time specified
		if (json.retry_after) {
			timeout =
				(parseInt(result.headers["Retry-After"] || "0") ||
					json.retry_after) * 1000;
			if (this.emitter)
				this.emitter.emit(
					"debug-rest",
					DateInISO(),
					`${ChangeConsoleColor(
						"FgRed",
						"[REST]"
					)} METHOD: ${method}, TO: ${endpoint}, STATUS: RATELIMITED. RETRYING AFTER ${timeout}ms`
				);
			return this.req(method, endpoint, data, timeout);
		}

		if (this.emitter)
			this.emitter.emit(
				"debug-rest",
				DateInISO(),
				`${ChangeConsoleColor(
					"FgRed",
					"[REST]"
				)} METHOD: ${method}, TO: ${endpoint}, STATUS: ${
					result.status || "NO STATUS"
				}`
			);

		return json;
	}

	public get me() {
		return {
			id: Buffer.from(this.token.split(".")[0], "base64").toString(
				"ascii"
			),
		};
	}
}
