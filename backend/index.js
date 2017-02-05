var express = require('express')
var app = express()
var bluebird = require('bluebird')
var pgp = require('pg-promise')({
  promiseLib: bluebird
})
var join = bluebird.join

require('dotenv').load()
var db = pgp({
  user: process.env.JOBBATICAL_USER,
  password: process.env.JOBBATICAL_PW,
  database: process.env.JOBBATICAL_DB,
  host: process.env.JOBBATICAL_HOST,
  port: 5432,
  max: 10,
  idleTimeoutMillis: 1000
})

app.get('/users', function(req, res){
  var id = parseInt(req.query.id)
  var payload = {
    companies: [],
    createdListings: [],
    applications: []
  }

  db.task(function(t) {

    return t.one('SELECT * FROM users WHERE id = $1', id)
      .then(function(user){
        if (!user) {
          return res.json({}) // TODO: Replace with error message
        }
        Object.assign(payload, {
          'id': user.id,
          'name': user.name,
          'createdAt': user.created_at
        })
        return user

    }).then(function(user){

      // Cannot get the company info directly; need to get IDs from teams table first
      return t.result('SELECT company_id, contact_user FROM teams WHERE user_id = $1 LIMIT 5', user.id)
        .then(function(companyInfoByUser){

          var companyIds = companyInfoByUser.rows.map(function(x){
            return x.company_id
          })
          return t.any('SELECT * FROM companies WHERE id = ANY($1::int[])', [companyIds]) // TODO: Limit to 5
            .then(function(companies){

              // Is the user a contact for each company they are associated with?
              for (company in companies){
                var thisCompany = companies[company]
                var miscInfo = companyInfoByUser.rows.find(function(o){
                  return o.company_id === thisCompany.id
                })
                Object.assign(thisCompany, miscInfo)

                thisCompany.createdAt = thisCompany.created_at  // minor editing
                thisCompany.isContact = thisCompany.contact_user
                delete(thisCompany.created_at)
                delete(thisCompany.contact_user)
                delete(thisCompany.company_id)

                payload.companies.push(thisCompany)
              }
              return user
            })
        })

    }).then(function(user){

      return t.any("SELECT * from listings WHERE created_by = $1 LIMIT 5", user.id) // TODO: sort?
        .then(function(listings){

          for (listing in listings){
            var thisListing = listings[listing]
            payload.createdListings.push({
              'id': payload.id,
              'createdAt': thisListing.created_at,
              'name': thisListing.name,
              'description': thisListing.description
            })

          }

          var listingIds = listings.map(function(x){
            return x.id
          })

      return user

    }).then(function(user){

      return t.any('SELECT * FROM applications WHERE user_id = $1', user.id) // TODO: Limit to 5
        .then(function(applications){

          for (application in applications){
            var thisApplication = applications[application]
            return t.any('SELECT * FROM listings WHERE id = $1', thisApplication.listing_id)
              .then(function(listing){

                thisApplication.listing = listing[0]
                thisApplication.coverLetter = thisApplication.cover_letter // minor editing
                delete(thisApplication.listing.created_by)
                delete(thisApplication.listing.created_at)
                delete(thisApplication.listing_id)
                delete(thisApplication.user_id)
                delete(thisApplication.cover_letter)

                payload.applications.push(thisApplication)
              })
          }

        return user
        })

      })

    }).then(function(user){
      res.json(payload)
    }).catch(function(error){
      // error
    })

  })
})

app.get('/topActiveUsers', function(req, res){
  var pageNumber = req.query.page || 1

})

app.listen(3000)
