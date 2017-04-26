var SLA = artifacts.require("./SLA.sol");

contract('SLA', function(accounts) {

  const _costPerKbps = 100;

  it("should save the address of the creator as the _owner", function() {
    return SLA.deployed().then(function(instance) {
      return instance._owner.call({from: accounts[0]});
    }).then(function(address) {
      assert.equal(address, accounts[0], "accounts[0] wasn't the owner of the contract");
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should reject a provider registration with non-positive _costPerKbps", function() {
    return SLA.deployed().then(function(instance) {
      return instance.registerProvider(accounts[1], 0, 0, 1,
                                       {from: accounts[0]});
    }).then(function(tx_id) {
      for (var i = 0; i < tx_id.logs.length; i++) {
        var log = tx_id.logs[i];
        if (log.event == "RegisteredProvider") {
          assert.fail(false, true, "RegisteredProvider event found, expected none");
        }
      }
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should reject a provider registration with non-positive _penaltyPerKbps", function() {
    return SLA.deployed().then(function(instance) {
      return instance.registerProvider(accounts[1], 0, 1, 0,
                                       {from: accounts[0]});
    }).then(function(tx_id) {
      for (var i = 0; i < tx_id.logs.length; i++) {
        var log = tx_id.logs[i];
        if (log.event == "RegisteredProvider") {
          assert.fail(false, true, "RegisteredProvider event found, expected none");
        }
      }
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should register a new provider if invoked by the owner", function() {
    return SLA.deployed().then(function(instance) {
      return instance.registerProvider(accounts[1], 0, _costPerKbps, 1,
                                       {from: accounts[0]});
    }).then(function(tx_id){
      var found = false;
      for (var i = 0; i < tx_id.logs.length; i++) {
        var log = tx_id.logs[i];
        if (log.event == "RegisteredProvider") {
          assert.equal(log.args._provider, accounts[1]);
          found = true;
          break;
        }
      }
      assert.isTrue(found);
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should fire event and update pendingWithdrawals when notifyPayment is called", function() {
    var amount = 10;
    var instance;
    var account_one_starting_pending;
    var account_one_ending_pending;
    return SLA.deployed().then(function(inst) {
      instance = inst;
      return instance.pendingWithdrawals.call(accounts[1]);
    }).then(function(pending){
      account_one_starting_pending = pending.toNumber();
      return instance.notifyPayment(accounts[1], amount, {from: accounts[0]});
    }).then(function(notify_txid){
      var found = false;
      for (var i = 0; i < notify_txid.logs.length; i++) {
        var log = notify_txid.logs[i];
        if (log.event == "PeriodicPayout") {
          found = true;
          assert.equal(log.args._tputInKbps.toNumber(), amount);
          break;
        }
      }
      assert.isTrue(found);
      return instance.pendingWithdrawals.call(accounts[1]);
    }).then(function(newPending){
      account_one_ending_pending = newPending.toNumber();
      assert.equal(account_one_ending_pending, account_one_starting_pending + amount * _costPerKbps);
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });


  it("should allow withdrawal and remove pending funds when withdraw", function() {
    //TODO: check that the contract was charged, and that no InsufficientFunds was thrown
    // var account_zero_starting_balance;
    // var account_zero_ending_balance;
    var account_one_starting_balance;
    var account_one_ending_balance;
    var account_one_starting_pending;
    return SLA.deployed().then(function(inst) {
      instance = inst;
      // account_zero_starting_balance = web3.eth.getBalance(accounts[0]);
      account_one_starting_balance = web3.eth.getBalance(accounts[1]);
      console.log("starting balance", account_one_starting_balance.toString(10)); // web3.fromWei(account_one_starting_balance, "ether"));
      return instance.pendingWithdrawals.call(accounts[1]);
    }).then(function(pending){
      account_one_starting_pending = pending;
      console.log("pending withdrawal", account_one_starting_pending.toString(10));
      return instance.increaseFunds({from: accounts[0], value: 2*pending});
    }).then(function(funds_txid){
      return instance.withdraw({from: accounts[1]});
    }).then(function(withdraw_txid){
      // console.log("transaction receipt: ", withdraw_txid);
      // account_zero_ending_balance = web3.eth.getBalance(accounts[0]);
      var tx_cost = withdraw_txid.receipt.gasUsed * web3.eth.gasPrice;
      console.log("transaction cost", tx_cost.toString(10));
      account_one_ending_balance = web3.eth.getBalance(accounts[1]);
      console.log("ending balance", account_one_ending_balance.toString(10)); // web3.fromWei(account_one_ending_balance, "ether"));
      // assert.equal(account_zero_starting_balance - account_zero_ending_balance, new BigNumber(10), "account zero was not charged")
      var account_one_credit = account_one_ending_balance.minus(account_one_starting_balance);
      assert.equal(account_one_credit, account_one_starting_pending.minus(tx_cost), "account one was not credited");
      return instance.pendingWithdrawals.call(accounts[1]);
    }).then(function(newPending){
      assert.equal(newPending.toNumber(), 0);
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should reject a second registration for the same provider", function() {
    return SLA.deployed().then(function(instance) {
      return instance.registerProvider(accounts[1], 0, 1, 1,
                                       {from: accounts[0]});
    }).then(function(tx_id) {
      for (var i = 0; i < tx_id.logs.length; i++) {
        var log = tx_id.logs[i];
        if (log.event == "RegisteredProvider") {
          assert.fail(false, true, "RegisteredProvider event found, expected none");
        }
      }
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should remove a reigstered provider after it has been blocked", function() {
    return SLA.deployed().then(function(instance) {
      return instance.blockProvider(accounts[1], {from: accounts[0]});
    }).then(function(tx_id) {
      var found = false;
      for (var i = 0; i < tx_id.logs.length; i++) {
        var log = tx_id.logs[i];
        if (log.event == "BlockedProvider") {
          // if (log.event._provider == accounts[0]) {
            found = true;
          // }
        }
      }
      assert.isTrue(found);
    }).catch(function(error){
      console.log(error);
      assert.fail();
    });
  });

  it("should throw when we try to block an unregistered provider");

});
