'use strict';

var _ = require('underscore'),
    Promise = require('promise-polyfill');

var Backbone = require('backbone');

var Landmark = require('./landmark'),
    Log = require('./log'),
    AssetSource = require('./assetsource'),
    Modal = require('../view/modal');

var App = Backbone.Model.extend({

    defaults: function () {
        return {
            landmarkSize: 0.5,
            mode: 'mesh',
            connectivityOn: true,
            editingOn: true,
            autoSaveOn: true,
            activeTemplate: undefined,
            activeCollection: undefined,
            helpOverlayIsDisplayed: false,
            log: {}
        };
    },

    isConnectivityOn: function () {
        return this.get('connectivityOn');
    },

    isAutoSaveOn: function () {
        return this.get('autoSaveOn');
    },

    toggleAutoSave: function () {
        return this.set('autoSaveOn', !this.isAutoSaveOn());
    },

    toggleConnectivity: function () {
        this.set('connectivityOn', !this.isConnectivityOn());
    },

    isEditingOn: function () {
        return this.get('editingOn');
    },

    toggleEditing: function () {
        this.set('editingOn', !this.isEditingOn());
        if (!this.isEditingOn()) {
            this.landmarks().deselectAll();
            this.landmarks().resetNextAvailable();
        }
    },

    isHelpOverlayOn: function () {
        return this.get('helpOverlayIsDisplayed');
    },

    toggleHelpOverlay: function () {
        this.set('helpOverlayIsDisplayed', !this.isHelpOverlayOn());
    },

    mode: function () {
        return this.get('mode');
    },

    imageMode: function () {
        return this.get('mode') === 'image';
    },

    meshMode: function () {
        return this.get('mode') === 'mesh';
    },

    server: function () {
        return this.get('server');
    },

    templates: function () {
        return this.get('templates');
    },

    activeTemplate: function () {
        return this.get('activeTemplate');
    },

    collections: function () {
        return this.get('collections');
    },

    activeCollection: function () {
        return this.get('activeCollection');
    },

    log: function () {
            return this.get('log');
    },

    hasAssetSource: function () {
        return this.has('assetSource');
    },

    assetSource: function () {
        return this.get('assetSource');
    },

    assetIndex: function () {
        if (this.has('assetSource')) {
            return this.get('assetSource').assetIndex();
        }

    },

    // returns the currently active Asset (Image or Asset).
    // changes independently of mesh() - care should be taken as to which one
    // other objects should listen to.
    asset: function () {
        return this.get('asset');
    },

    // returns the currently active THREE.Mesh.
    mesh: function () {
        if (this.hasAssetSource()) {
            return this.assetSource().mesh();
        } else {
            return null;
        }
    },

    landmarks: function () {
        return this.get('landmarks');
    },

    initialize: function () {
        _.bindAll(this, 'assetChanged', 'mesh', 'assetSource', 'landmarks');

        // New collection? Need to find the assets on them again
        this.listenTo(this, 'change:activeCollection', this.reloadAssetSource);
        this.listenTo(this, 'change:activeTemplate', this.reloadAssetSource);
        this.listenTo(this, 'change:mode', this.reloadAssetSource);

        this._initTemplates();
        this._initCollections();
    },

    _initTemplates: function (override=false) {
        // firstly, we need to find out what template we will use.
        // construct a template labels model to go grab the available labels.
        this.server().fetchTemplates().then((templates) => {
            this.set('templates', templates);
            let selected = templates[0];
            if (!override && this.has('_activeTemplate')) {
                // user has specified a preset! Use that if we can
                // TODO should validate here if we can actually use template
                const preset = this.get('_activeTemplate');
                if (templates.indexOf(preset) > -1) {
                    selected = preset;
                }
            }
            this.set('activeTemplate', selected);
        }, () => {
            throw new Error('Failed to talk server for templates (is ' +
                            'landmarkerio running from your command line?).');
        });
    },

    _initCollections: function (override=false) {
        this.server().fetchCollections().then((collections) => {
            this.set('collections', collections);
            let selected = collections[0];
            if (!override && this.has('_activeCollection')) {
                const preset = this.get('_activeCollection');
                if (collections.indexOf(preset) > -1) {
                    selected = preset;
                }
            }
            this.set('activeCollection', selected);
        }, () => {
            throw new Error('Failed to talk server for collections (is ' +
                            'landmarkerio running from your command line?).');
        });
    },

    reloadAssetSource: function () {
        // needs to have an activeCollection to preceed. AssetSource should be
        // updated every time the active collection is updated.
        if (!this.get('activeCollection')) {
            // can only proceed with an activeCollection...
            console.log('App:reloadAssetSource with no activeCollection - doing nothing');
            return;
        }

        console.log('App: reloading asset source');

        let oldIndex;
        if (this.has('asset') && this.has('assetSource')) {
            const idx = this.assetSource().assetIndex(this.asset());
            if (idx > -1) {
                oldIndex = idx;
            }
        }

        // Construct an asset source (which can query for asset information
        // from the server). Of course, we must pass the server in. The
        // asset source will ensure that the assets produced also get
        // attached to this server.
        var ASC = this._assetSourceConstructor();
        var assetSource = new ASC({
            server: this.server(),
            id: this.activeCollection()
        });
        if (this.has('assetSource')) {
            this.stopListening(this.get('assetSource'));
        }
        this.set('assetSource', assetSource);
        this.set('log', {});
        // whenever our asset source changes it's current asset and mesh we need
        // to update the app state.
        this.listenTo(assetSource, 'change:asset', this.assetChanged);
        this.listenTo(assetSource, 'change:mesh', this.meshChanged);

        assetSource.fetch().then(() => {
            let i;

            console.log('assetSource retrieved - setting');

            if (oldIndex >= 0 && !this.hasChanged('activeCollection')) {
                i = oldIndex;
            } else if (this.has('_assetIndex') && !this.has('asset')) {
                i = this.get('_assetIndex');
            } else {
                i = 0;
            }

            if (i < 0 || i > assetSource.nAssets() - 1) {
                throw Error(`Error trying to set index to ${i} - needs to be in the range 0-${assetSource.nAssets()}`);
            }

            return this.goToAssetIndex(i);
        }, () => {
            throw new Error('Failed to fetch assets (is landmarkerio' +
                            'running from your command line?).');
        });
    },

    _assetSourceConstructor: function () {
        if (this.imageMode()) {
            return AssetSource.ImageSource;
        } else if (this.meshMode()) {
            return AssetSource.MeshSource;
        } else {
            console.error('WARNING - illegal mode setting on app! Must be' +
                ' mesh or image');
        }
    },

    // Mirror the state of the asset source onto the app
    assetChanged: function () {
        console.log('App.assetChanged');
        this.set('asset', this.assetSource().asset());
    },

    meshChanged: function () {
        console.log('App.meshChanged');
        this.trigger('newMeshAvailable');
    },

    _promiseLandmarksWithAsset: function (loadAssetPromise) {
        // returns a promise that will only resolve when the asset and
        // landmarks are both downloaded and ready.

        // Try and find an in-memory log for this asset
        const log = this.log();
        if (!log[this.asset().id]) {
            log[this.asset().id] = new Log();
        }

        const assetLog = log[this.asset().id];

        var loadLandmarksPromise = this.server().fetchLandmarkGroup(
            this.asset().id,
            this.activeTemplate()
        ).then((json) => {
            return Landmark.parseGroup(json,
                                       this.asset().id, this.activeTemplate(),
                                       this.server(), assetLog);
        }, () => {
            console.log('Error in fetching landmark JSON file');
        });

        // if both come true, then set the landmarks
        return Promise.all([loadLandmarksPromise,
                            loadAssetPromise]).then((args) => {
            var landmarks = args[0];
            console.log('landmarks are loaded and the asset is at a suitable ' +
                'state to display');
            // now we know that this is resolved we set the landmarks on the
            // app. This way we know the landmarks will always be set with a
            // valid asset.
            this.set('landmarks', landmarks);
        });
    },

    _switchToAsset: function (newAssetPromise) {
        // The asset promise should come from the assetSource and will only
        // resolve when all the key data for annotating is loaded, the
        // promiseLandmark wraps it and only resolves when both landmarks (if
        // applicable) and asset data are present
        if (newAssetPromise) {
            this.set('landmarks', null);
            return this._promiseLandmarksWithAsset(newAssetPromise);
        }
    },

    nextAsset: function () {
        if (this.assetSource().hasSuccessor()) {
            const lms = this.landmarks();
            const _go = () => {
                this._switchToAsset(this.assetSource().next());
            };

            if (lms && !lms.log.isCurrent()) {
                if (!this.isAutoSaveOn()) {
                    Modal.confirm('You have unsaved changes, are you sure you want to leave this asset ? (Your changes will be lost)', _go);
                } else {
                    lms.save().then(_go);
                }
            } else {
                _go();
            }
        }
    },

    previousAsset: function () {
        if (this.assetSource().hasPredecessor()) {
            const lms = this.landmarks();
            const _go = () => {
                this._switchToAsset(this.assetSource().previous());
            };

            if (lms && !lms.log.isCurrent()) {
                if (!this.isAutoSaveOn()) {
                    Modal.confirm('You have unsaved changes, are you sure you want to leave this asset ? (Your changes will be lost)', _go);
                } else {
                    lms.save().then(_go);
                }
            } else {
                return _go();
            }
        }
    },

    goToAssetIndex: function (newIndex) {
        return this._switchToAsset(this.assetSource().setIndex(newIndex));
    },

    reloadLandmarksFromPrevious: function () {
        const currentLms = this.landmarks();
        const as = this.assetSource();
        if (this.assetSource().hasPredecessor()) {
            this.server().fetchLandmarkGroup(
                as.assets()[as.assetIndex() - 1].id,
                this.activeTemplate()
            ).then((json) => {
                const lms = Landmark.parseGroup(
                    json,
                    this.asset().id,
                    this.activeTemplate(),
                    this.server(),
                    currentLms.log
                );
                this.set('landmarks', lms);
            }, () => {
                console.log('Error in fetching landmark JSON file');
            });
        }
    }

});

module.exports = App;
