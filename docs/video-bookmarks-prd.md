# Video Bookmarks

Video has proliferated across the web, and not every site has a good queue/history feature. Not to mention that sometimes, you might not want to use the history features of a site if it detracts from your experience (e.g. YT watch history).

Thankfully with video being a first-class citizen in browsers now instead of a plugin, extensions should have access to the metadata needed to make tracking your history locally quite practical.

## Manual bookmarks

### User Story

As a viewer of online videos, I want to track where I am in longer videos so I can come back and resume them later.

### Description

The idea here is to allow the user to mark their current page for tracking. The extension will then track the last known timestamp as well as the furthest known timestamp.

### Scope

This will start out supporting a limited number of sites, mostly just to contain scope and ease testing.

Supported sites:

* YouTube

### Challenges

There are two challenges that I can think of off the top of my head that may cause issues for use cases outside my own immediate use case. Multi-video pages and ads. Neither of which are issues for me personally with the sites I plan to support for MVP, but could be issues for others. (e.g. I have YT premium, so no ads there for me.)

#### Multi-video pages

Sites that I would be personally interested in typically have at most one video control on the page, so locating it isn't an issue on those pages. However, if there's a site with multiple videos on a page, that makes things more complicated. The correct video would need to be identified so it can be properly tracked.

#### Ads

I'm not exactly sure how video ads work on top of the videos. Are they an overlay with their own video element (such that both players exist at the same time)? Or is one swapped out for the other? I'm not sure at this time, and the answer may be different depending on the site, but I did want to call this out as a potential issue.

## Auto history

### User Story

As a viewer of online videos, I'd like my video watching history on certain sites to be auto-tracked so I can keep track of where I am in a series.

### Description

Some sites (like HIDIVE) have lousy/non-existent tracking of watched videos in a series, so I have to track that manually. For those sites, I'd like a record of the videos I have watched so I can track where I am in certain series.

### Scope

This will leverage the functionality from the manual bookmarks and expand it to be able to auto-track when watching videos on supported sites. Again, scope will be limited due to time constraints and to ease testing.

Supported sites:

* YouTube  
* ~~HIDIVE~~ (due to time constraints, not implementing support for this site for now)

