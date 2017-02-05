var express = require('express')
var app = express()
var bluebird = require('bluebird')
var moment = require('moment')
var pgp = require('pg-promise')({
  promiseLib: bluebird
})
var join = bluebird.join

require('dotenv').load()
var db = pgp({
  user: 'justin' || process.env.JOBBATICAL_USER,
  password: '' || process.env.JOBBATICAL_PW,
  database: 'justin' || process.env.JOBBATICAL_DB,
  host: 'localhost' || process.env.JOBBATICAL_HOST,
  port: 5432,
  max: 10,
  idleTimeoutMillis: 1000
})

app.get('/users', function(req, res) {
  var id = parseInt(req.query.id) || 1
  var payload = {
    companies: [],
    createdListings: [],
    applications: []
  }

  db.task(function(t) {

    return t.one('SELECT * FROM users WHERE id = $1', id)
      .then(function(user) {
        if (!user) {
          return res.json({}) // TODO: Replace with error message
        }
        Object.assign(payload, {
          'id': user.id,
          'name': user.name,
          'createdAt': user.created_at
        })
        return user

    }).then(function(user) {

      return t.result('SELECT DISTINCT t.company_id, t.contact_user, c.* \
                       FROM teams AS t INNER JOIN companies AS c \
                       ON c.id = t.company_id \
                       WHERE t.user_id = $1 LIMIT 5', user.id)

        .then(function(companies){
          companies.rows.map(function(x){

            x.createdAt = x.created_at  // minor editing
            x.isContact = x.contact_user
            delete(x.created_at)
            delete(x.contact_user)
            delete(x.company_id)

            payload.companies.push(x)
          })
          return user
        })

    }).then(function(user) {

      return t.any("SELECT * from listings WHERE created_by = $1 LIMIT 5", user.id) // TODO: sort?
        .then(function(listings) {

          // TODO: Replace with forEach
          for (listing in listings) {
            var thisListing = listings[listing]
            payload.createdListings.push({
              'id': payload.id,
              'createdAt': thisListing.created_at,
              'name': thisListing.name,
              'description': thisListing.description
            })

          }
          return user

    }).then(function(user) {

      return t.result('SELECT DISTINCT a.id as app_id, a.created_at, a.cover_letter, l.id as listing_id, l.name, l.description \
                       FROM applications AS a INNER JOIN listings AS l \
                       ON listing_id = a.listing_id \
                       WHERE a.user_id = $1 LIMIT 5', user.id)
        .then(function(applications) {
          applications.rows.map(function(x){
            payload.applications.push({
              'id': x.app_id,
              'createdAt': x.created_at,
              'coverLetter': x.cover_letter,
              'listing': {
                'id': x.listing_id,
                'name': x.name,
                'description:': x.description
              }
            })
          })
          return user
        })

      })

    }).then(function(user) {
      res.json(payload)
    }).catch(function(error) {
      // TODO: Catch error here
    })

  })
})

app.get('/topActiveUsers', function(req, res) {
  var pageNumber = parseInt(req.query.page) || 0
  var payload = []

  // 1. Determine what "last week" is
  var endOfWeek = moment().format('YYYY/MM/DD')
  var startOfWeek = moment().subtract(7, 'days').format('YYYY/MM/DD')

  db.task(function(t) {

    // 2. Query all applications in last week, sort by user occurrence
    return t.any("SELECT user_id, COUNT(*) AS count FROM applications \
                  WHERE created_at BETWEEN $1 AND $2 \
                  GROUP BY user_id \
                  ORDER BY count DESC, user_id \
                  LIMIT 5 OFFSET $3", [startOfWeek, endOfWeek, 5 * pageNumber])

      .then(function(topUsers) {

        // 3. Inject user data into payload
        return t.batch(topUsers.map(function(user) {
          return t.one("SELECT * from users WHERE id = $1", user.user_id)
            .then(function(user) {
              var thisTopUser = topUsers.find(function(x) {
                return x.user_id === user.id
              })

              payload.push({
                'id': user.id,
                'createdAt': user.created_at,
                'name': user.name,
                'count': thisTopUser.count,
                listings: []
              })

              // 4. Take newest 3 listings for each user and inject into appropriate user
              return t.any("SELECT name from listings \
                            WHERE created_by = $1 \
                            ORDER BY created_at DESC \
                            LIMIT 3", user.id)
                .then(function(listings) {
                  var targetUser = payload.find(function(x) {
                    return x.id === user.id
                  })
                  targetUser.listings = listings.map(function(x) {
                    return x.name // we just want the names
                  })
                })

            })
          }) // end map
        ) // end batch

      })

  }).then(function() {
    res.json(payload)
  }).catch(function(error) {
    // TODO: Catch error here
  })

})

app.listen(3000)
