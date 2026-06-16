import { env } from "./utils.js";
import { log } from "./logger.js";
import axios, { AxiosError, RawAxiosRequestHeaders } from "axios";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ReqOptions {
  body?: unknown;
  headers?: RawAxiosRequestHeaders;
}

export default class DiscordRestClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = env.DISCORD_API_URL;
  }

  async req(
    method: HttpMethod,
    endpoint: string,
    options?: ReqOptions,
    retryAfterMs?: number
  ): Promise<unknown> {
    if (retryAfterMs) await new Promise((r) => setTimeout(r, retryAfterMs * 1.01));

    const headers: RawAxiosRequestHeaders = {
      "User-Agent": "gitbot/2.0",
      Authorization: `Bot ${this.token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    };

    const result = await axios({
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers,
      data: options?.body,
    }).catch((e: AxiosError) => {
      log.error({ err: e.response?.data, method, endpoint }, "Discord REST error");
      return null;
    });

    if (!result) return;

    const json: any = result.data ?? {};

    // Handle rate limits
    if (json.retry_after) {
      const delay = (parseInt(result.headers["retry-after"] ?? "0") || json.retry_after) * 1000;
      log.warn({ method, endpoint, delay }, "Rate limited by Discord, retrying");
      return this.req(method, endpoint, options, delay);
    }

    return json;
  }

  /** Extracts the bot's application ID from its token. */
  get me(): { id: string } {
    return {
      id: Buffer.from(this.token.split(".")[0], "base64").toString("ascii"),
    };
  }
}
