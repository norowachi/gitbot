# GITBOT (real)

Integration of the discord and github api, so you can create bugs (and memleaks!) without stopping your conversation :D

# Already Hosted Version

You can use [Gitbot](https://norowa.dev/gitbot/invite) on discord without having to host it yourself :D
(p.s. not up for prod yet as the project is still WIP)

---

now onto the real talk

# Requirements

1. A domain, even a [nginx](https://nginx.org) or [cloudflared tunnel](https://www.cloudflare.com/products/tunnel/) one would work, then add it to your `.env` file & your bot's "Interactions Endpoint URL"
2. [NodeJS](https://nodejs.org)
3. A [MongoDB](https://mongodb.com) DataBase
   > learn how to create one [here](https://www.mongodb.com/resources/products/fundamentals/create-database)
4. [Docker](https://docker.com) (Optional)

## SelfHosting without docker

1. Clone the repo
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
5. Go to project Dir. & Install all dependencies
   > ```
   > pnpm i -P --frozen-lockfile
   > ```
6. Register commands
   > ```
   > pnpm register
   > ```
7. Finally start the gitbot
   > ```
   > pnpm start
   > ```

And now you also have your own local gitbot! (_yippe_)


## SelfHosting with Docker

##### (certified "it works on my machine" moment) the docker version is somehow not running correctly on my machine :P

1. Clone the repo
   > ```sh
   > git clone https://github.com/Noro95/gitbot && cd gitbot
   > ```
2. Create a `.env` file and fill it according to `example.env`
3. The Docker Commands

- 1. Build the image
     > ```sh
     > docker compose build
     > ```
- 2. Register the commands
     > ```sh
     > docker run --rm gitbot-app pnpm register
     > ```
- 3. Run the GitBot
     > ```sh
     > docker compose up
     > ```

and voila! you now have your own friendly local gitbot.
