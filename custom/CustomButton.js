/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

export default class CustomButton {

  constructor(eventBus, commandStack, modelTransformer) {
    this._eventBus = eventBus;
    this._commandStack = commandStack;
    this._modelTransformer=modelTransformer;

    // Bind this globally
    this.createSwitchElement = this.createSwitchElement.bind(this);

    this._eventBus.once('import.render.complete', this.createSwitchElement);
  }



  createSwitchElement() {
    const palette = document.querySelector('.djs-palette');
    palette.insertAdjacentHTML('beforeend', this.switchElement());

    this.registerEventListeners();
  }

  registerEventListeners() {
    this.handleAddEvent = this.handleAddEvent.bind(this);
    var modelTransformer=this._modelTransformer;



    const addButton = document.querySelector('#add-choreography');

    // addButton.addEventListener('click', this.handleAddEvent);
    document.querySelector('#file-input').addEventListener('change', function() {



      console.log("starting to read files");
      // list of selected files
      var all_files = this.files;
      if (all_files.length == 0) {
        alert('deine mudder');
        return;
      }



      // first file selected by user

      var file = all_files[0];


      // file validation is successful
      // we will now read the file
      var reader = new FileReader();

      // file reading started
      reader.addEventListener('loadstart', function() {
        console.log('File reading started');
      });

      // file reading finished successfully
      reader.addEventListener('load', function(e) {
        var text = e.target.result;
        var parser = new DOMParser();
        let parseString = require('xml2js').parseString;
        parseString(text, function(err, result) {
          modelTransformer.transformModel(result);

        });
      });

      // file reading failed
      reader.addEventListener('error', function() {
        alert('Error : Failed to read file');
      });

      // file read progress
      reader.addEventListener('progress', function(e) {
        if (e.lengthComputable == true) {
    	var percent_read = Math.floor((e.loaded/e.total)*100);
    	console.log(percent_read + '% read');
        }
      });

      // read as text file
      reader.readAsText(file);
    });

  }

  switchElement() {
    return `
        <label for="file-input">Choose File</label>

        <!-- accept a text file -->
        <input type="file" id="file-input" style="display:none"  />
        `;
  }
  openfileDialog() {
    console.log('openfiledialog');
    $('#fileLoader').click();
  }

  handleAddEvent() {
    console.log('lulz');

    // this._commandStack.execute('choreography.create', {});
  }





}

CustomButton.$inject = [
  'eventBus',
  'commandStack',
  'modelTransformer'
];
