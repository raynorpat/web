---
title: "Refreshed for 2026"
date: 2026-07-09
description: "New Site!"
---

## Finally

Finally an update of this site. I have been relying on a static HTML5 Up template for the past ~3 years and it was time to refresh the site with a new design and updated content.

So I went back in time and found my old Ruby and Sinatra code and decided to use that as a base for the new site. I had to convert the old articles to Markdown from archive.org's .atom file - that was fun.

## New Site

I did not keep the Ruby code for long, instead I opted to use Claude, and have it work out a Hugo conversion, as the HTML5 Up template site was statically hosted in Azure, using a Static Web App.
I wanted to keep the site static and simple and keep hosting costs as near zero as possible - after all, this is a personal site and I do not want to spend money on hosting it - haven't in a long time.

I also wanted to improve the original site layout a bit - make it a tad bit mobile friendly and easier to read. Adding a better social link page was on the list as well.

The other piece, using Markdown for article posts, was kept, made a lot easier with a GitHub Actions workflow that runs Hugo to build the site and push it to the Azure Static Web App automatically.

## Conclusion

Maybe, I'll end up blogging again, maybe not. We shall see! :)
