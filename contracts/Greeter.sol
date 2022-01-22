//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

import 'hardhat/console.sol';

/// @title A contract for boilerplating
/// @author Hardhat (and DeFi Wonderland)
/// @notice You can use this contract for only the most basic tests
/// @dev This is just a try out
/// @custom:experimental This is an experimental contract.

contract Greeter {
  event GreetingSet(string _greeting);

  error EmptyGreeting();

  string public greeting;

  constructor(string memory _greeting) {
    console.log('Deploying a Greeter with greeting:', _greeting);
    greeting = _greeting;
  }

  function greet() public view returns (string memory) {
    return greeting;
  }

  /// @notice Sets greeting that will be used during greet
  /// @dev Some explanation only defined for devs
  /// @param _greeting The greeting to be used
  /// @return _changedGreet Was greeting changed or nah
  function setGreeting(string memory _greeting) public returns (bool _changedGreet) {
    if (bytes(_greeting).length == 0) revert EmptyGreeting();
    console.log('Changing greeting from', greeting, 'to', _greeting);
    greeting = _greeting;
    _changedGreet = true;
    emit GreetingSet(_greeting);
  }
}
