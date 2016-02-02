var generateCrumb = require("../handlers/crumb.js"),
  Code = require('code'),
  Lab = require('lab'),
  lab = exports.lab = Lab.script(),
  describe = lab.experiment,
  before = lab.before,
  afterEach = lab.afterEach,
  after = lab.after,
  it = lab.test,
  expect = Code.expect,
  nock = require('nock'),
  _ = require('lodash'),
  MockTransport = require('nodemailer-mock-transport'),
  sendEmail = require('../../adapters/send-email'),
  emailMock,
  server;

var requireInject = require('require-inject');
var redisMock = require('redis-mock');
var client = redisMock.createClient();

before(function(done) {
  requireInject.installGlobally('../mocks/server', {
    redis: redisMock
  })(function(obj) {
    server = obj;
    sendEmail.mailConfig.mailTransportModule = new MockTransport();
    emailMock = sendEmail.mailConfig.mailTransportModule;
    done();
  });
});

afterEach(function(done) {
  emailMock.sentMail = [];
  done();
});

after(function(done) {
  server.stop(done);
});

var payload = {
  id: 'tok_12345',
  livemode: 'false',
  created: '1426198429',
  used: 'false',
  object: 'token',
  type: 'card',
  card: {},
  email: 'exists@boom.com',
  verification_allowed: 'true',
  client_ip: 'localhost',
  amount: '2500',
  subType: '1',
  quantity: '1',
  customerId: '12345'
};

var stripeCustomer = {
  object: 'customer',
  created: 1426198433,
  id: 'cus_123abc',
  livemode: false,
  description: 'exists@boom.com npm On-Site Starter Pack',
  email: 'exists@boom.com',
  delinquent: false,
  metadata: {},
  subscriptions: {
    object: 'list',
    total_count: 1,
    has_more: false,
    url: '/v1/customers/cus_123abc/subscriptions',
    data: [[Object]]
  },
  discount: null,
  account_balance: 0,
  currency: 'usd',
  cards: {
    object: 'list',
    total_count: 1,
    has_more: false,
    url: '/v1/customers/cus_123abc/cards',
    data: [[Object]]
  },
  default_card: 'card_15feYq4fnGb60djYJsvT2YGG',
  sources: {
    object: 'list',
    total_count: 1,
    has_more: false,
    url: '/v1/customers/cus_123abc/sources',
    data: [[Object]]
  },
  default_source: 'card_15feYq4fnGb60djYJsvT2YGG'
};

function assertEmail() {
  var expectedName = 'Boom Bam';
  var expectedEmail = 'exists@bam.com';
  var expectedTo = '"' + expectedName + '" <' + expectedEmail + '>';
  var expectedFrom = '"npm, Inc." <website@npmjs.com>';
  var expectedLicenseKey = '0feed16c-0f28-4911-90f4-dfe49f7bfb41';
  var expectedSupportEmail = 'support@npmjs.com';
  var expectedRequirementsUrl = 'https://docs.npmjs.com/enterprise/requirements';
  var expectedInstructionsUrl = 'https://docs.npmjs.com/enterprise/installation';

  var msg = emailMock.sentMail[0];
  expect(msg.data.to).to.equal(expectedTo);
  expect(msg.message._headers.find(function(header) {
    return header.key === 'To';
  }).value).to.equal(expectedTo);
  expect(msg.data.from).to.equal(expectedFrom);
  expect(msg.message._headers.find(function(header) {
    return header.key === 'From';
  }).value).to.equal(expectedFrom);
  expect(msg.data.license_key).to.equal(expectedLicenseKey);
  expect(msg.data.support_email).to.equal(expectedSupportEmail);
  expect(msg.data.requirementsUrl).to.equal(expectedRequirementsUrl);
  expect(msg.data.instructionsUrl).to.equal(expectedInstructionsUrl);
  expect(msg.message.content).to.match(new RegExp(expectedName));
  expect(msg.message.content).to.match(new RegExp(expectedEmail));
  expect(msg.message.content).to.match(new RegExp(expectedLicenseKey));
  expect(msg.message.content).to.match(new RegExp(expectedSupportEmail));
  expect(msg.message.content).to.match(new RegExp(expectedRequirementsUrl));
  expect(msg.message.content).to.match(new RegExp(expectedInstructionsUrl));
}

describe('Posting to the enterprise license purchase page', function() {
  it('errors out if the email sent is invalid', function(done) {
    generateCrumb(server, function(crumb) {
      var p = _.extend({}, payload, {
        email: 'invalid',
        crumb: crumb
      });

      var opts = {
        url: '/enterprise/buy-license',
        method: 'post',
        payload: p,
        headers: {
          cookie: 'crumb=' + crumb
        }
      };

      server.inject(opts, function(resp) {
        try {
          expect(resp.statusCode).to.equal(403);
          var source = resp.request.response.source;
          expect(source).to.equal('validation error');
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  it('renders an error if we get an error from hubspot', function(done) {
    generateCrumb(server, function(crumb) {

      var p = _.extend({}, payload, {
        email: 'error@boom.com',
        crumb: crumb
      });

      var opts = {
        url: '/enterprise/buy-license',
        method: 'post',
        payload: p,
        headers: {
          cookie: 'crumb=' + crumb
        }
      };

      server.inject(opts, function(resp) {
        try {
          expect(resp.statusCode).to.equal(500);
          var source = resp.request.response.source;
          expect(source).to.equal('error loading customer');
          done();
        } catch (e) {
          done(e)
        }
      });
    });
  });

  it('renders an error if the customer is not found', function(done) {
    generateCrumb(server, function(crumb) {

      var p = _.extend({}, payload, {
        email: 'new@boom.com',
        crumb: crumb
      });

      var opts = {
        url: '/enterprise/buy-license',
        method: 'post',
        payload: p,
        headers: {
          cookie: 'crumb=' + crumb
        }
      };

      server.inject(opts, function(resp) {
        try {
          expect(resp.statusCode).to.equal(500);
          var source = resp.request.response.source;
          expect(source).to.equal('customer not found');
          done();
        } catch (e) {
          done(e)
        }
      });
    });
  });

  it('renders an error if the customerID does not match the token customerID', function(done) {
    generateCrumb(server, function(crumb) {

      var p = _.extend({}, payload, {
        customerId: '123',
        crumb: crumb
      });

      var opts = {
        url: '/enterprise/buy-license',
        method: 'post',
        payload: p,
        headers: {
          cookie: 'crumb=' + crumb
        }
      };

      server.inject(opts, function(resp) {
        try {
          expect(resp.statusCode).to.equal(500);
          var source = resp.request.response.source;
          expect(source).to.equal('error validating customer ID');
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  describe('for a multi-seat license', function() {
    it('sends an email on success', function(done) {
      var mock = nock('https://api.stripe.com')
        .post('/v1/customers')
        .query({
          card: 'tok_12345',
          plan: 'enterprise-multi-seat',
          quantity: 20,
          email: 'exists@boom.com',
          description: 'exists@boom.com npm On-Site multi-seat license'
        })
        .reply(200, stripeCustomer);


      generateCrumb(server, function(crumb) {
        var p = _.extend({}, payload, {
          subType: 3,
          quantity: 20,
          crumb: crumb
        });

        var opts = {
          url: '/enterprise/buy-license',
          method: 'post',
          payload: p,
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(opts, function(resp) {
          try {
            mock.done();
            expect(resp.statusCode).to.equal(200);
            var source = resp.request.response.source;
            expect(source).to.equal('License purchase successful');
            assertEmail();
            done();
          } catch (e) {
            done(e);
          }
        });
      });
    });
  });

});
