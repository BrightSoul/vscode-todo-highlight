/**
 * vscode plugin for highlighting TODOs and FIXMEs within your code
 *
 * NOTE: each decoration type has a unique key, the highlight and clear highight functionality are based on it
 */

var vscode = require('vscode');
var util = require('./util');
var window = vscode.window;
var workspace = vscode.workspace;

function activate(context) {

    var timeout = null;
    var activeEditor = window.activeTextEditor;
    var isCaseSensitive, assembledData, decorationTypes, patterns, styleForRegExp, keywordsPattern;
    var workspaceState = context.workspaceState;

    var settings = workspace.getConfiguration('todohighlight');

    init(settings);

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.toggleHighlight', function () {
        settings.update('isEnable', !settings.get('isEnable'), true).then(function () {
            triggerUpdateDecorations();
        });
    }))

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.listAnnotations', function () {
        if (keywordsPattern.trim()) {
            util.searchAnnotations(workspaceState, patterns, util.annotationsFound);
        } else {
            if (!assembledData) return;
            var availableAnnotationTypes = Object.keys(assembledData);
            availableAnnotationTypes.unshift('ALL');
            util.chooseAnnotationType(availableAnnotationTypes).then(function (annotationType) {
                if (!annotationType) return;
                var searchPatterns = patterns;
                if (annotationType != 'ALL') {
                    annotationType = util.escapeRegExp(annotationType);
                    searchPattern = patterns.map(p => new RegExp(annotationType, isCaseSensitive ? 'g' : 'gi'));
                }
                util.searchAnnotations(workspaceState, searchPattern, util.annotationsFound);
            });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('todohighlight.showOutputChannel', function () {
        var annotationList = workspaceState.get('annotationList', []);
        util.showOutputChannel(annotationList);
    }));

    if (activeEditor) {
        triggerUpdateDecorations();
    }

    window.onDidChangeActiveTextEditor(function (editor) {
        activeEditor = editor;
        if (editor) {
            triggerUpdateDecorations();
        }
    }, null, context.subscriptions);

    workspace.onDidChangeTextDocument(function (event) {
        if (activeEditor && event.document === activeEditor.document) {
            triggerUpdateDecorations();
        }
    }, null, context.subscriptions);

    workspace.onDidChangeConfiguration(function () {
        settings = workspace.getConfiguration('todohighlight');

        //NOTE: if disabled, do not re-initialize the data or we will not be able to clear the style immediatly via 'toggle highlight' command
        if (!settings.get('isEnable')) return;

        init(settings);
        triggerUpdateDecorations();
    }, null, context.subscriptions);

    function updateDecorations() {

        if (!activeEditor || !activeEditor.document) {
            return;
        }

        var text = activeEditor.document.getText();
        var lines = text.split("\n");
        var mathes = {}, match;
        for (var i = 0; i < patterns.length; i++) {
            var pattern = patterns[i].text;
            var regexp = patterns[i].regexp;
            while (match = regexp.exec(text)) {
                var startPos = activeEditor.document.positionAt(match.index);
                var endPos = activeEditor.document.positionAt(match.index + match[0].length);
                var decoration = {
                    range: new vscode.Range(startPos, endPos)
                };

                var matchedValue = match[0];
                if (!isCaseSensitive) {
                    matchedValue = matchedValue.toUpperCase();
                }

                if (mathes[pattern]) {
                    mathes[pattern].push(decoration);
                } else {
                    mathes[pattern] = [decoration];
                }

                if (keywordsPattern.trim() && !decorationTypes[pattern]) {
                    var editorDecoration = window.createTextEditorDecorationType(styleForRegExp);
                    decorationTypes[pattern] = { block: editorDecoration, inline: editorDecoration };
                }
            }
        }

        Object.keys(decorationTypes).forEach((v) => {
            if (!isCaseSensitive) {
                v = v.toUpperCase();
            }
            var rangeOption = settings.get('isEnable') && mathes[v] ? mathes[v] : [];
            var decorationType = decorationTypes[v];
            if (decorationType.inline == decorationType.block) {
                activeEditor.setDecorations(decorationType.inline, rangeOption);
            } else {
                activeEditor.setDecorations(decorationType.block, rangeOption);
                    /*for (var i = 0; i < rangeOption.length; i++) {
                        var range = rangeOption[i].range;
                        for (var l = range.start.line; l <= range.end.line; l++) {
                            var style = decorationType.block;
                            if (l == range.start.line) {
                                var partialRange = new vscode.Range(new vscode.Position(l, range.start.character), new vscode.Position(l, l == range.end.line ? range.end.character : lines[l].length - 1));
                                if (range.start.character == 0 && (l < range.end.line || lines[l].replace("\r", "").length <= range.end.character)) {
                                    activeEditor.setDecorations(decorationType.block, [partialRange]);
                                } else {
                                    activeEditor.setDecorations(decorationType.inline, [partialRange]);
                                }
                            } else if (l == range.end.line) {
                                var partialRange = new vscode.Range(new vscode.Position(l, 0), new vscode.Position(l, range.end.character));
                                activeEditor.setDecorations(decorationType.inline, [partialRange]);

                            } else {
                                var partialRange = new vscode.Range(new vscode.Position(l, 0), new vscode.Position(l, 1));
                                activeEditor.setDecorations(decorationType.block, [partialRange]);
                            }

                        }
                    }
                    */
            }
        })
    }

    function init(settings) {
        var customDefaultStyle = settings.get('defaultStyle');
        keywordsPattern = settings.get('keywordsPattern');
        isCaseSensitive = settings.get('isCaseSensitive', true);

        if (!window.statusBarItem) {
            window.statusBarItem = util.createStatusBarItem();
        }
        if (!window.outputChannel) {
            window.outputChannel = window.createOutputChannel('TodoHighlight');
        }

        decorationTypes = {};

        if (keywordsPattern.trim()) {
            styleForRegExp = Object.assign({}, util.DEFAULT_STYLE, customDefaultStyle, {
                overviewRulerLane: vscode.OverviewRulerLane.Right
            });
            patterns = [keywordsPattern];
        } else {
            assembledData = util.getAssembledData(settings.get('keywords'), customDefaultStyle, isCaseSensitive);
            Object.keys(assembledData).forEach((v) => {
                if (!isCaseSensitive) {
                    v = v.toUpperCase()
                }

                var mergedStyle = Object.assign({}, {
                    overviewRulerLane: vscode.OverviewRulerLane.Right
                }, assembledData[v]);

                if (!mergedStyle.overviewRulerColor) {
                    // use backgroundColor as the default overviewRulerColor if not specified by the user setting
                    mergedStyle.overviewRulerColor = mergedStyle.backgroundColor;
                }

                var blockEditorDecoration = window.createTextEditorDecorationType(mergedStyle);
                var inlineEditorDecoration = blockEditorDecoration;
                if (mergedStyle.isWholeLine) {
                    mergedStyle.isWholeLine = false;
                    inlineEditorDecoration = window.createTextEditorDecorationType(mergedStyle);
                }
                decorationTypes[v] = { block: blockEditorDecoration, inline: inlineEditorDecoration };
            });

            patterns = Object.keys(assembledData).map((v) => v);
        }

        patterns = patterns.map(p => { return { text: p, regexp: new RegExp(p, isCaseSensitive ? 'gm' : 'gim') }; });

    }

    function triggerUpdateDecorations() {
        timeout && clearTimeout(timeout);
        timeout = setTimeout(updateDecorations, 0);
    }
}

exports.activate = activate;
