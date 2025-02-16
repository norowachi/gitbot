# GITBOT

Integration of the discord and github api, so you can submit bugs (and memleaks!) without stopping your conversation :D

# Already Hosted Version

You can use [Gitbot](https://norowa.dev/gitbot/invite) on discord without having to host it yourself :D

---

# Requirements

1. A domain, even a [nginx](https://nginx.org) or [cloudflared tunnel](https://www.cloudflare.com/products/tunnel/) one would work, then add it to your `.env` file & your bot's "Interactions Endpoint URL"
2. [NodeJS](https://nodejs.org)
3. A [MongoDB](https://mongodb.com) DataBase
   > learn how to create one [here](https://www.mongodb.com/resources/products/fundamentals/create-database)

## Self Hosting

1. Clone the repo & Go to project's dir.
   > ```sh
   > git clone https://github.com/Noro95/gitbot && cd gitbot
   > ```
   or whatever method you prefer
2. [Download NodeJS](https://nodejs,org/en/download)
3. Create a `.env` file and fill it according to `example.env`
4. Install pnpm
   > ```sh
   > npm i -g pnpm@latest
   > ```
5. Install all dependencies
   > ```
   > pnpm i -P --frozen-lockfile
   > ```
6. Register commands
   > ```
   > pnpm register
   > ```
7. Finally start the bot
   > ```
   > pnpm start
   > ```

And now you also have your own local gitbot! _(yippe)_
