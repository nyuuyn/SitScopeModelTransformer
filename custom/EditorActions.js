
'use strict';

function EditorActions(
    eventBus,
    modelTransformer,
    editorActions
) {
    editorActions.register({
        importXML: function(){
            //modelTransformer.transformModel()

        }
    })
}
EditorActions.$inject = [
    'eventBus',
    'modelTransformer',
    'editorActions'
  ];
  
  module.exports = EditorActions;