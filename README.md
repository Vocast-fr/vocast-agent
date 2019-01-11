# vocast-agent

Source code for the Vocast's Google Assistant app - https://vocast.fr

- Play episode from Spreaker's API
- Vocazap game 

## Init - to use for another project 

```
firebase login
firebase use [alias_or_project_id]
firebase functions:config:set dashbot.key="XXXXXXXXXXXXXXXXxx"
firebase functions:config:set gcloudactionssdk.clientid="XXXXXXXXXXX.apps.googleusercontent.com"
```

## Deploy 

```
firebase deploy 
```