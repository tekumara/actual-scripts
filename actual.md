# actual

> Actual has two parts: the client (the stuff you see and interact with), and an optional sync server. The server is what allows syncing your budget file between devices and allows for bank syncing. A full list of what does and does not require the sync server can be found in [this table](https://actualbudget.org/docs/install).

## Desktop client

The desktop client is an electron app that stores files locally.

Install:

```
brew install actual
```

The electron app files under _~/Documents/Actual_.

This location can be configured from the cog icon on the Files page.

## Server

The server keeps its copy of files inside the sqlite db at _user-files/\*.blob_.
