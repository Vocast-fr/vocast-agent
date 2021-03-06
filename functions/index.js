const {
  dialogflow,
  Image,
  //  MediaResponse,
  List,
  SignIn,
  SimpleResponse,
  Suggestions
} = require('actions-on-google')
const admin = require('firebase-admin')
const functions = require('firebase-functions')
const { get, sample, slice } = require('lodash')
const fetch = require('superagent')

const dashbot = require('dashbot')(functions.config().dashbot.key).google

admin.initializeApp()
const auth = admin.auth()
const db = admin.firestore()
db.settings({ timestampsInSnapshots: true })

const {
  helpResponses,
  podcastResponse,
  suggestionsResponse,
  vocazapResponse,
  welcomeResponse
} = require('./responses')

const { getRandomRadioForChip } = require('./utils')

const EPISODES_URL = 'https://api.spreaker.com/v2/shows/2886866/episodes'

const app = dialogflow({
  clientId: functions.config().gcloudactionssdk.clientid,
  debug: false
})
dashbot.configHandler(app)

app.intent('Aide', conv => {
  helpResponses(conv)
})

app.intent('Choix episode', (conv, params, episode) => {
  // console.log('Choix ', episode)
  const fullEpisode = undefined
  return podcastResponse(conv, params, fullEpisode, episode)
})

app.intent('Connexion', async (conv, params, signin) => {
  if (signin.status === 'OK') {
    conv.data.rejectSignIn = false
    const payload = conv.user.profile.payload

    const { email, given_name, family_name } = payload

    conv.user.storage.userInfos = { email, given_name, family_name }

    // console.log('User authenticated', conv.user.storage.userInfos)

    if (email) {
      try {
        conv.user.storage.dbUser = await auth.getUserByEmail(email)
      } catch (e) {
        if (e.code !== 'auth/user-not-found') {
          throw e
        }
        // If the user is not found, create a new Firebase auth user
        // using the email obtained from the Google Assistant
        conv.user.storage.dbUser = await auth.createUser({ email })
      }
    }

    conv.ask(
      new SimpleResponse({
        text: `Vous êtes bien authentifié ! Vous pouvez maintenant jouer au Vocazap ;)`,
        speech: `Vous êtes bien authentifié ! Vous pouvez maintenant jouer au Vocazap.`
      })
    )
    const radio = conv.user.storage.vocazapRadio
    if (radio) {
      return vocazapResponse(conv, radio)
    } else {
      conv.ask(
        new SimpleResponse({
          text: `Informez 'Vocazap' suivi de la radio de votre choix, que choisissez-vous ?`,
          speech: `Informez 'Vocazap' suivi de la radio de votre choix, que choisissez-vous ?`
        })
      )
      suggestionsResponse(conv)
    }
  } else {
    conv.data.rejectSignIn = true

    conv.ask(
      `L'authentification n'est pas possible. Demandez un 'Vocazap au hasard' pour écouter un zapping Vocazap sans participer au concours`
    )

    if (conv.screen) {
      conv.ask(new Suggestions([`Vocazap au hasard`, 'Liste épisodes']))
    }
  }
})

app.intent('Contenu bonus', conv => {
  conv.ask(
    new SimpleResponse({
      text:
        "Il n'y a pas encore d'épisodes bonus disponible. Revenez bientôt pour écouter du contenu exclusivement disponible via l'Assistant Google !",
      speech:
        "Il n'y a pas encore d'épisodes bonus disponible. Revenez bientôt pour écouter du contenu exclusivement disponible via l'Assistant Google !"
    })
  )
  helpResponses(conv)
})

app.intent('Default Fallback Intent', conv => {
  conv.ask(
    new SimpleResponse(
      sample([
        {
          text:
            "On va examiner cette demande un peu plus tard, car nous n'avons pas de réponses à vous apporter.",
          speech:
            '<speak>' +
            `<audio src='https://storage.googleapis.com/agent-responses/fallback_1.mp3'>` +
            "On va examiner cette demande un peu plus tard, car nous n'avons pas de réponses à vous apporter." +
            '</audio>' +
            '</speak>'
        },
        {
          text:
            "Nous n'avons pas tout compris... Il faut qu'on s'entraîne un peu plus pour être meilleurs ! Qu'est-ce qu'on fait du coup ?",
          speech:
            '<speak>' +
            `<audio src='https://storage.googleapis.com/agent-responses/fallback_2.mp3'>` +
            "Nous n'avons pas tout compris... Il faut qu'on s'entraîne un peu plus pour être meilleurs ! Qu'est-ce qu'on fait du coup ?" +
            '</audio>' +
            '</speak>'
        },
        {
          text:
            'Aïe ! Nous avons du mal à tout comprendre ! Peut-être avons-nous pas été assez clairs sur les choses que nous pouvons vous apporter ?',
          speech:
            '<speak>' +
            `<audio src='https://storage.googleapis.com/agent-responses/fallback_3.mp3'>` +
            'Aïe ! Nous avons du mal à tout comprendre ! Peut-être avons-nous pas été assez clairs sur les choses que nous pouvons vous apporter ?' +
            '</audio>' +
            '</speak>'
        }
      ])
    )
  )
  helpResponses(conv)
})

app.intent('Default Welcome Intent', conv => {
  welcomeResponse(conv)
})

app.intent('Extrait Des Ondes Vocast', (conv, params) => {
  const fullEpisode = false
  return podcastResponse(conv, params, fullEpisode)
})

app.intent('Intégrale Des Ondes Vocast', (conv, params) => {
  const fullEpisode = true
  return podcastResponse(conv, params, fullEpisode)
})

app.intent('Jeu Vocazap', (conv, params) => {
  const { radios } = params

  // console.log('Jeu vocazap', radios, conv.user.storage.userInfos)

  if (radios && radios.length) {
    conv.user.storage.vocazapRadio = radios

    if (conv.user.storage.userInfos) {
      return vocazapResponse(conv, radios)
    } else if (conv.data.rejectSignIn) {
      conv.ask(
        new SimpleResponse({
          text:
            'Vous avez refusé de vous connecter, je vais lancer un Vocazap au hasard sans participation au jeu.',
          speech:
            'Vous avez refusé de vous connecter, je vais lancer un Vocazap au hasard sans participation au jeu.'
        })
      )
      return vocazapResponse(conv)
    } else {
      conv.ask(
        new SignIn('Pour jouer au Vocazap et être contacté en cas de gain')
      )
    }
  } else {
    const randomRadio = getRandomRadioForChip()
    const randomRadio2 = getRandomRadioForChip()
    const randomRadio3 = getRandomRadioForChip()

    conv.ask(
      new SimpleResponse({
        text: `Pour jouer au Vocazap, dites 'Vocazap' suivi du nom d'une radio. Exemple : 'Vocazap sur ${randomRadio}'`,
        speech: `Pour jouer au Vocazap, dites 'Vocazap' suivi du nom d'une radio. Exemple : 'Vocazap sur ${randomRadio}'`
      })
    )
    conv.ask(
      new Suggestions([
        `Vocazap sur ${randomRadio}`,
        `Vocazap sur ${randomRadio2}`,
        `Vocazap sur ${randomRadio3}`
      ])
    )
  }
})

app.intent('Lecture terminée', async conv => {
  const mediaStatus = conv.arguments.get('MEDIA_STATUS')
  const { lastPlayed } = conv.user.storage

  // console.log({ mediaStatus, lastPlayed })

  await db.runTransaction(t => {
    t.set(db.collection('played').doc(`${+new Date()}`), {
      date: new Date(),
      mediaStatus: mediaStatus || false,
      lastPlayed: lastPlayed || false,
      email: get(conv, 'user.storage.userInfos.email', false)
    })
    return Promise.resolve('Wrote in DB')
  })

  conv.ask("J'ai fini de diffuser l'extrait sonore")

  // @todo regarding lastPlayed, broadcast another media

  helpResponses(conv)
})

app.intent('Liste des épisodes', conv => {
  if (!conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    conv.ask(
      "Vous pouvez écouter les épisodes en entier ou demander des extraits sur l'innovation ou les archives par exemple. Que souhaitez-vous ?"
    )
  } else {
    return fetch(EPISODES_URL).then(async r => {
      let items = {}
      slice(r.body.response.items, 0, 5).forEach(item => {
        const { episode_id, title, image_url } = item
        items[episode_id] = {
          synonyms: [title],
          title,
          description: ' ',
          image: new Image({
            url: image_url,
            alt: title
          })
        }
      })

      conv.ask(
        new SimpleResponse({
          text: 'Voici la liste des derniers épisodes et extraits',
          speech: 'Voici la liste des derniers épisodes et extraits'
        })
      )
      conv.ask(
        new List({
          title: 'Les derniers épisodes et extraits',
          items
        })
      )
    })
  }
})

app.intent('Malformed Vocast', conv => {
  welcomeResponse(conv)
})

app.intent('No input', conv => {
  conv.close(
    new SimpleResponse({
      text:
        'Vous ne semblez plus répondre. Je suppose que vous souhaitez quitter. A très bientôt sur vocast.fr ! ',
      speech:
        'Vous ne semblez plus répondre. Je suppose que vous souhaitez quitter. A très bientôt sur vocast.fr ! '
    })
  )
})

app.intent('Quitter', conv => {
  conv.close(
    new SimpleResponse({
      text: 'Vous souhaitez quitter. A très bientôt sur vocast.fr ! ',
      speech: 'Vous souhaitez quitter. A très bientôt sur vocast.fr ! '
    })
  )
})

app.intent('Supprimer les données', conv => {
  console.log('Suppression des données demandé')

  conv.user.storage.played = null

  conv.ask(
    new SimpleResponse({
      text: "J'ai bien supprimé vos historiques de lecture.",
      speech: "J'ai bien supprimé vos historiques de lecture."
    })
  )

  helpResponses(conv)
})

app.intent('Vocazap au hasard', conv => {
  return vocazapResponse(conv)
})

exports.dialogflowVocastAgentFulfillment = functions.https.onRequest(app)
exports.dialogflowVocastAgentFulfillmentLaunch = require('./_launch')
