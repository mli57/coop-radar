# Contributing

## Request a company

Use the "Request a company" form on the site's Companies page, or
[open a request](https://github.com/mli57/coop-radar/issues/new?template=request-company.yml) on GitHub.

## Add a company yourself

Add one entry to `config/companies.yaml` and open a pull request:

```yaml
  - name: Example Corp
    url: https://example.com/careers
```

Use the page that actually lists the jobs. If the company uses Ashby, Greenhouse, Lever, Workday
or Recruitee, the job board link (for example `https://jobs.ashbyhq.com/example`) works best.

That's all a PR needs. After it's merged, a maintainer runs `npm run bootstrap -- "Example Corp"`
to create its scraping recipe. Until then it shows as "Not set up yet" on the Companies page.

## Run it locally

Use Node 24, the version the monitor workflow runs on.

```
npm install
npx playwright install chromium   # only needed for companies without a known job board

npm run bootstrap -- "Example Corp"   # create a recipe for one company
npm run monitor                       # scrape every company and update data/
npm test
```

`npm run monitor` sends Discord messages last, after `data/` is saved. Without the webhook
settings in `.env` (see the README) it ends with an error at that step, but the data is still
updated. Bootstrapping a company with no known job board needs a free Gemini API key
(`GEMINI_API_KEY` in `.env`).

The website:

```
cd web
npm install
npm run dev    # uses the data in ../data
npm test
npm run e2e
```
