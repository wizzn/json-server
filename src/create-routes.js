var _ = require('underscore')
var low = require('lowdb')
var _db = require('underscore-db')
var _inflections = require('underscore.inflections')
var utils = require('./utils')

low.mixin(_db)
low.mixin(_inflections)

module.exports = function(object, filename) {
  if (filename) {
    var db = low(filename)
  } else {
    var db = low()
    _.extend(db.object, object)
  }

  return {
    // GET /db
    showDatabase: function(req, res, next) {
      res.jsonp(db.object)
    },

    // GET /:resource
    // GET /:resource?q=
    // GET /:resource?attr=&attr=
    // GET /:parent/:parentId/:resource?attr=&attr=
    // GET /*?*&_end=
    // GET /*?*&_start=&_end=
    list: function(req, res, next) {
      // Filters list
      var filters = {}

      // Result array
      var array

      // Remove _start and _end from req.query to avoid filtering using those
      // parameters
      var _start = req.query._start
      var _end = req.query._end
      var _sort = req.query._sort
      var _order = req.query._order

      delete req.query._start
      delete req.query._end
      delete req.query._sort
      delete req.query._order

      if (req.query.q) {

        // Full-text search
        var q = req.query.q.toLowerCase()

        array = db(req.params.resource).where(function(obj) {
          for (var key in obj) {
            var value = obj[key]
            if (_.isString(value) && value.toLowerCase().indexOf(q) !== -1) {
              return true
            }
          }
        }).value()

      } else {

        // Add :parentId filter in case URL is like /:parent/:parentId/:resource
        if (req.params.parent) {
          filters[req.params.parent.slice(0, - 1) + 'Id'] = req.params.parentId
        }

        // Add query parameters filters
        // Convert query parameters to their native counterparts
        for (var key in req.query) {
          if (key !== 'callback') {
            filters[key] = req.query[key]
          }
        }

        // Filter
        if (_(filters).isEmpty()) {
          array = db(req.params.resource).value()
        } else {
          array = db(req.params.resource).where(filters).value()
        }
      }

      if(_sort) {
        _order = _order || 'ASC'

        array = _.sortBy(array, function(element) {
          return element[_sort];
        })

        if (_order === 'DESC') {
          array.reverse();
        }
      }

      // Slice result
      if (_end) {
        res.setHeader('X-Total-Count', array.length)
        res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')

        _start = _start || 0

        array = array.slice(_start, _end)
      }

      res.jsonp(array)
    },

    // GET /:resource/:id
    show: function(req, res, next) {
      var resource = db(req.params.resource)
        .get(+req.params.id)
        .value()

      if (resource) {
        res.jsonp(resource)
      } else {
        res.status(404).jsonp({})
      }
    },

    // POST /:resource
    create: function(req, res, next) {
      for (var key in req.body) {
        req.body[key] = utils.toNative(req.body[key])
      }

      var resource = db(req.params.resource)
        .insert(req.body)
        .value()

      res.jsonp(resource)
    },

    // PUT /:resource/:id
    // PATCH /:resource/:id
    update: function(req, res, next) {
      for (var key in req.body) {
        req.body[key] = utils.toNative(req.body[key])
      }

      var resource = db(req.params.resource)
        .update(+req.params.id, req.body)
        .value()

      if (resource) {
        res.jsonp(resource)
      } else {
        res.status(404).jsonp({})
      }
    },

    // DELETE /:resource/:id
    destroy: function(req, res, next) {
      db(req.params.resource).remove(+req.params.id)

      // Remove dependents documents
      var removable = utils.getRemovable(db.object)

      _(removable).each(function(item) {
        db(item.name).remove(item.id)
      })

      res.status(204).end()
    }
  }
}
