# GITBOT (real)

Integration of the discord and github api, so you can create bugs (and memleaks!) without stopping your conversation :D

# Already Hosted Version

You can use [Gitbot](https://norowa.dev/gitbot/invite) on discord without having to host it yourself :D
(p.s. not up for prod yet as the project is still WIP)

---

now onto the real talk

# Requirements

1. [NodeJS](https://nodejs.org)
2. A [MongoDB](https://mongodb.com) DataBase
   > learn how to create one [here](https://www.mongodb.com/resources/products/fundamentals/create-database)
3. [Docker](https://docker.com) (Optional)

## SelfHosting with Docker

1. Clone the repo
   > ```sh
   > git clone https://github.com/Noro95/gitbot && cd gitbot
   > ```
2. Create a `.env` file and fill it according to `example.env`
3. The Docker Commands

- 1. Build the image
     > ```sh
     > docker build -t gitbot .
     > ```
- 2. Register the commands
     > ```sh
     > docker run gitbot pnpm register
     > ```
- 3. Run the GitBot
     > ```sh
     > pnpm start
     > ```

and voila! you now have your own friendly local gitbot.

## SelfHosting without docker

Without docker adds some other extra steps, instead of `"3. The Docker Commands"`

1. [Download NodeJS](https://nodejs,org/en/download)
2. Install pnpm
   > ```sh
   > npm i -g pnpm@latest
   > ```
3. Go to project Dir. & Install all dependencies
   > ```
   > pnpm i -P --frozen-lockfile
   > ```
4. Register commands
   > ```
   > pnpm register
   > ```
5. Finally start the gitbot
   > ```
   > pnpm start
   > ```

And now you also have your own local gitbot! (_yippe_)

### For Public Hosting

To host your own GitBot publicly you'll have to get a domain, even a [nginx](https://nginx.org) or [cloudflared tunnel](https://www.cloudflare.com/products/tunnel/) one would work, then add it to your bot's "Interactions Endpoint URL" instead of `http://localhost:{PORT}`

# DO NOT FORGET TO PUT YOUR {SITE_URL} IN THE "INTERACTION ENDPOINT URL" FIELD IN DEV PORTAL