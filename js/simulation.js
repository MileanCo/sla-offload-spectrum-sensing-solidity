module.exports = function(callback) {
  // console.log(sla_artifacts);
  // load web3 to interact with the blockchain
  var Web3 = require('web3')
  if (typeof web3 != 'undefined') {
    web3 = new Web3(web3.currentProvider);
  } else {
    web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545'));
  }
  var assert = require('assert');
  var accounts = web3.eth.accounts;

  // CONFIG VARS
  var sensing_band = 10;
  var bandwidth_granularity = 100;
  var owner_su = accounts[0];
  var helpers_list = [
    accounts[1],
    accounts[2],
    //accounts[3],
  ];

  const _relativeCostPerRound = 1;
  const _costPerRound = web3.toWei(_relativeCostPerRound, "ether");

  console.log("Starting with owner:");
  console.log(owner_su);
  console.log("Starting with helpers:");
  console.log(helpers_list);
  console.log("Starting with sensing_band %s bandwidth_granularity %s _costPerRound %s", sensing_band, bandwidth_granularity, _costPerRound);

  // READ CHEATING RECORD JSON FILE
  var fs = require('fs');
  var contents = fs.readFileSync('test/Cheating_Record.json', 'utf8');
  var cheating_record_json = JSON.parse(contents);
  function get_cheaters_round(round_index) {
    if (round_index < 0) {
      throw "no round_index provided";
    }
    // GET CHEATERS FOR ROUND I
    // READY FROM FILE / Python

    // READ who cheated in round from index
    // create cheater array from that
    var round_cheaters = cheating_record_json[round_index];
    console.log(round_cheaters);
    var cheaters_addr = [];
    for (var i=0; i<round_cheaters.length; i++) {
      var c = round_cheaters[i];
      if (c) {
        cheaters_addr.push(accounts[i]);
      }
    }
    console.log(cheaters_addr);

    return cheaters_addr;
  }

  // deploy contract and register provider
  var ServiceFactoryContract = artifacts.require("./ServiceFactory.sol");
  var SensingServiceContract = artifacts.require("./SensingService.sol");

  var serviceFactory;
  var sensingService;


  ServiceFactoryContract.deployed().then(function(instance) {
    serviceFactory = instance;
    // returns transaction
    console.log("newSensingService()");
    //address[] helpers, uint _sensing_band, uint _bandwidth_granularity, uint _costPerRound
    return serviceFactory.newSensingService(helpers_list, sensing_band, bandwidth_granularity, _costPerRound, {from:owner_su} );
  }).then(function(tx_obj) {
      console.log(tx_obj);
      // now we have created a new SensingService contract instance... retrieve it and then run some tests.
      console.log(tx_obj.logs[0]);
      var new_contract_address = tx_obj.logs[0].args.serviceAddr;
      console.log("got new SensingService contract at " + new_contract_address);
      SensingServiceContract.at(new_contract_address).then(function(instance) {
        sensingService = instance;
        //if (web3.eth.fromWei(web3.eth.getBalance(SLA.address)) < 5) {
        console.log("increasing funds for sensingContract from owner's account");
        return sensingService.increaseFunds({from: owner_su, value: web3.toWei(_relativeCostPerRound*50, "ether") });
      }).then(function(tx_obj) {
        console.log(tx_obj);
        main();
      }).catch(
        function(error) {
          console.log(error);
      });
  // errors for Factory
  }).catch( function(error) {
      console.log(error);
      assert.fail();
  });

  //hej
  var round_index = 0;
  function main() {
    // Enter here the name of the node you want to listen to (eg dub, bcn0, bcn1, etc.)
    node_name = "default"
    time_interval = 1 * 2 * 1000; // interval in ms over which compute the throughput
    var WebSocket = require('ws');
    var ws = new WebSocket('ws://airscope.ie:8080/','ascope');
    ws.on('open', function() {
      console.log("Connection successful");
      ws.send(node_name);
      console.log("Requesting node: " + node_name);
    });
    var is_first = true;
    var tput_values = [];
    console.log("set interval to run at " + time_interval);
    setInterval(run_round, time_interval);
    ws.on('message', function(data, flags) {
      if (is_first) {
        // First message is list of available nodes
        is_first = false;
      } else {
        var parsed = JSON.parse(data);
        //console.log(parsed);
      }
    });
  }


  function run_round() {
    console.log("Running round " + round_index);
    return sensingService.helperNotifyDataSent(helpers_list[0], round_index, {from: helpers_list[0]})
    .then(function(tx_obj) {
      console.log(tx_obj);
      assert.equal(tx_obj.logs[0].event, "NewRoundCreated");
      console.log(tx_obj.logs[0].event);
      var id = tx_obj.logs[0].args.round_index;
      console.log(id.toNumber());
      console.log(tx_obj.logs[1]);

      sensingService.helperNotifyDataSent(helpers_list[1], round_index, {from: helpers_list[1]})
      .then(function(tx_obj) {
        //console.log(tx_obj);
        assert.equal(tx_obj.logs[0].event, "RoundCompleted");
        console.log(tx_obj.logs[0].event);
        assert.equal(tx_obj.logs[1].event, "NotifyUsersToValidate");
        console.log(tx_obj.logs[1].event);
        console.log(tx_obj.logs[2].event);
        console.log(tx_obj.logs[3].event);
        var cheaters = get_cheaters_round(round_index);
        console.log("Cheaters: " + cheaters);
        sensingService.set_helpers_cheaters(cheaters, round_index, {from: owner_su})
        .then(function(tx_obj) {
          round_index ++;
          payout();
          console.log("\n");
        });
      });
    });
  };

  function payout(throughput) {
    return  sensingService.withdraw({from:helpers_list[0]})
      .then( function(tx_obj) {
          console.log(tx_obj.logs[0].event);
          var amount_owned = tx_obj.logs[0].args.amount_owed;
          console.log("Amount owed withdrawn: " + amount_owned.toNumber() + " from helper " + helpers_list[0]);
          sensingService.withdraw({from:helpers_list[1]})
          .then( function(tx_obj) {
              console.log(tx_obj.logs[0].event);
              var amount_owned = tx_obj.logs[0].args.amount_owed;
              console.log("Amount owed withdrawn: " + amount_owned.toNumber() + " from helper " + helpers_list[1]);
          });
      });
  }
}