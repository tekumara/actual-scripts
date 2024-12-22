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

## Import

### St George

Export CSV (nb: set the UI to order from oldest to latest).

using duckdb:

```sql
-- insert into table so we have rowid
CREATE TEMP TABLE ace AS SELECT * FROM read_csv_auto ('trans211224.csv');

.mode csv
.headers on
-- nb this will overwrite the file
.once trans.ace.csv

select '' as Num,strftime(Date, '%d/%m/%Y') as Date,
  -- format by stripping out leading transaction type and datetime (eg: 20Dec08:47)
  -- and using it as a comment bellow
  regexp_replace(
      Description, '^(Visa Purchase( O/Seas)?|Visa Credit( Overseas)?|Osko Withdrawal|Osko Deposit|Sct Deposit|Eftpos Debit|Eftpos Credit|Tfr Wdl BPAY Internet|(Cardless )?Atm Withdrawal( -Wbc)?Internet Deposit|Internet Withdrawal)\s+\S+\s',''
  ) as Payee,
  regexp_extract(
      Description, '^(Visa Purchase( O/Seas)?|Visa Credit( Overseas)?|Osko Withdrawal|Osko Deposit|Sct Deposit|Eftpos Debit|Eftpos Credit|Tfr Wdl BPAY Internet|(Cardless )?Atm Withdrawal( -Wbc)?|Internet Deposit|Internet Withdrawal)'
  ) as Notes,
  '' as Category,'' as S,
  Debit as Outflow,
  Credit as Inflow,
  Balance
from ace
order by rowid asc;
```
