'use strict';

import _ from 'underscore';
import Backbone from 'backbone';
import atomic from '../model/atomic';
import THREE from 'three';

export const LandmarkSizeSlider = Backbone.View.extend({

    el: '#lmSizeSlider',

    events: {
        input: "changeLandmarkSize"
    },

    initialize: function() {
        _.bindAll(this, 'render', 'changeLandmarkSize');
        this.listenTo(this.model, "change:landmarkSize", this.render);
        // set the size immediately.
        this.render();
    },

    render: function() {
        this.$el[0].value = this.model.get("landmarkSize") * 100;
        return this;
    },

    changeLandmarkSize: atomic.atomicOperation(function(event) {
        this.model.set(
            "landmarkSize",
            Math.max(Number(event.target.value) / 100, 0.05));
    })
});

export const TextureToggle = Backbone.View.extend({

    el: '#textureRow',

    events: {
        'click #textureToggle': "textureToggle"
    },

    initialize: function() {
        this.$toggle = this.$el.find('#textureToggle')[0];
        _.bindAll(this, 'changeMesh', 'render', 'textureToggle');
        this.listenTo(this.model, "newMeshAvailable", this.changeMesh);
        // there could already be an asset we have missed
        if (this.model.asset()) {
            this.changeMesh();
        }
        this.render();
    },

    changeMesh: function() {
        if (this.mesh) {
            this.stopListening(this.mesh);
        }
        this.listenTo(this.model.asset(), "all", this.render);
        this.mesh = this.model.asset();
    },

    render: function() {
        if (this.mesh) {
            this.$el.toggleClass('Toolbar-Row--Disabled', !this.mesh.hasTexture());
            this.$toggle.checked = this.mesh.isTextureOn();
        } else {
            this.$el.addClass('Toolbar-Row--Disabled');
        }
        return this;
    },

    textureToggle: function() {
        if (!this.mesh) {
            return;
        }
        this.mesh.textureToggle();
    }
});

export const ConnectivityToggle = Backbone.View.extend({

    el: '#connectivityRow',

    events: {
        'click #connectivityToggle': "connectivityToggle"
    },

    initialize: function() {
        this.$toggle = this.$el.find('#connectivityToggle')[0];
        _.bindAll(this, 'render', 'connectivityToggle');
        this.listenTo(this.model, 'change:connectivityOn', this.render);
        this.render();
    },

    render: function() {
        this.$toggle.checked = this.model.isConnectivityOn();
        return this;
    },

    connectivityToggle: function() {
        this.model.toggleConnectivity();
    }
});

export const EditingToggle = Backbone.View.extend({

    el: '#editingRow',

    events: {
        'click #editingToggle': "editingToggle"
    },

    initialize: function() {
        this.$toggle = this.$el.find('#editingToggle')[0];
        _.bindAll(this, 'render', 'editingToggle');
        this.listenTo(this.model, 'change:editingOn', this.render);
        this.render();
    },

    render: function() {
        this.$toggle.checked = this.model.isEditingOn();
        return this;
    },

    editingToggle: function() {
        this.model.toggleEditing();
    }
});

export const AutoSaveToggle = Backbone.View.extend({

    el: '#autosaveRow',

    events: {
        'click #autosaveToggle': "toggle"
    },

    initialize: function() {
        this.$toggle = this.$el.find('#autosaveToggle')[0];
        _.bindAll(this, 'render', 'toggle');
        this.listenTo(this.model, 'change:autoSaveOn', this.render);
        this.render();
    },

    render: function() {
        this.$toggle.checked = this.model.isAutoSaveOn();
        return this;
    },

    toggle: function() {
        this.model.toggleAutoSave();
    }
});


export const componentSlider = Backbone.View.extend({

    el: '',

    events: {
        input: "onchange"
    },

    initialize: function() {
        _.bindAll(this, 'render', 'onchange');
        this.listenTo(this.model, "newMeshAvailable", this.changeMesh);

        // there could already be an asset we have missed
        if (this.model.asset()) {
            this.changeMesh();
        }

        this.model.set("pcValuePre", []);
        this.model.set("pcValueAll", []);

        // set the size immediately.
        this.render();
    },

    render: function() {
        return this;
    },

    changeMesh: function() {
        if (this.mesh) {
            this.stopListening(this.mesh);
        }
        this.listenTo(this.model.asset(), "all", this.render);
        this.mesh = this.model.asset();

        var pc_length = this.mesh.max_pc + this.mesh.max_exp;
        if (pc_length &&
            !this.mesh.max_components) {

            this.mesh.max_components = pc_length;
            var init_array = new Array(this.mesh.max_pc + this.mesh.max_exp).fill(0);

            this.model.set("pcValueAll", _.clone(init_array));
            this.model.set("pcValuePre", _.clone(init_array));
        }
    },

    updateGeo: function() {

        console.log('Update Geo');

        var new_geometry = this.mesh.geometry;

        if (new_geometry instanceof THREE.BufferGeometry) {
            console.log('convert BufferGeometry to Geometry');
            new_geometry = new THREE.Geometry().fromBufferGeometry(new_geometry);
        }


        new_geometry.dynamic = true;
        new_geometry.__dirtyVertices = true;

        var pc_pre = this.model.get("pcValuePre");
        var pc_now = this.model.get("pcValueAll");


        for (var j in this.mesh.pcgeometries) {
            var pc_vec = this.mesh.pcgeometries[j].vertices;
            var prev_theta = pc_pre[j];
            var theta = pc_now[j];

            if (prev_theta != theta) {

                if (prev_theta != 0) {

                    for (var i = new_geometry.vertices.length - 1; i >= 0; i--) {
                        var p_vec = pc_vec[i];

                        new_geometry.vertices[i].x -= prev_theta * p_vec.x;
                        new_geometry.vertices[i].y -= prev_theta * p_vec.y;
                        new_geometry.vertices[i].z -= prev_theta * p_vec.z;
                    }
                }

                if (theta != 0) {

                    for (var i = new_geometry.vertices.length - 1; i >= 0; i--) {
                        var p_vec = pc_vec[i];

                        new_geometry.vertices[i].x += theta * p_vec.x;
                        new_geometry.vertices[i].y += theta * p_vec.y;
                        new_geometry.vertices[i].z += theta * p_vec.z;
                    }
                }
            }
        }

        new_geometry.verticesNeedUpdate = true;
        // new_geometry.normalsNeedUpdate = true;
    },

});


// Principle Components Slider
export const PCSlider = componentSlider.extend({

    el: '#pcSlider',

    initialize: function() {
        componentSlider.prototype.initialize.call(this);
        this.listenTo(this.model, "needUpdate", this.render);
    },

    render: function() {
        var index = this.model.get("pcIndex");
        this.$el[0].value = this.model.get("pcValueAll")[index];
        return this;
    },

    onchange: atomic.atomicOperation(function(event) {

        var theta = Number(event.target.value);
        var index = this.model.get("pcIndex");

        var pc_value = this.model.get("pcValueAll");
        this.model.set("pcValuePre", _.clone(pc_value));

        pc_value[index] = theta;
        this.model.set("pcValueAll", _.clone(pc_value));

        this.model.trigger('needUpdate');

    })
});

export const PCSelect = componentSlider.extend({

    el: '#pcSelect',

    initialize: function() {
        componentSlider.prototype.initialize.call(this);
        this.model.set("pcIndex", 0);
        this.listenTo(this.model, "needUpdate", this.updateGeo);
    },

    render: function() {
        var pc_indexes = [];
        if (this.mesh && this.mesh.pcgeometries)
            pc_indexes = Object.keys(this.mesh.pcgeometries);


        var pclength = this.$el[0].options.length;
        for (var i = 0; i < pclength; i++) {
            this.$el[0].remove(0);
        }


        var pcIndex = this.model.get("pcIndex");

        pc_indexes.forEach((index) => {
            var option = document.createElement("option");
            option.text = index;
            if (parseInt(index) == pcIndex) {
                option.selected = true;
            }
            this.$el[0].add(option);
        });

        return this;
    },

    onchange: atomic.atomicOperation(function(event) {

        var index = Number(event.target.value);

        var pc_value = this.model.get("pcValueAll");
        this.model.set("pcValuePre", _.clone(pc_value));


        this.model.set("pcIndex", index);
        this.model.trigger('needUpdate');
    })
});

export const PCSample = Backbone.View.extend({

    el: '#sample',

    events: {
        'click': "sample"
    },

    sample: atomic.atomicOperation(function(event) {

        var pc_value = this.model.get("pcValueAll");
        this.model.set("pcValuePre", _.clone(pc_value));

        if(!this.mesh)
            this.mesh = this.model.asset();

        var new_pc = pc_value.map((v,i) => {
            return i < this.mesh.max_pc ? Math.random() * 10 - 5 : 0;
        });

        this.model.set("pcValueAll", _.clone(new_pc));

        console.log(this.model.get("pcValueAll"));
        this.model.trigger('needUpdate');
    })
});

export const PCRest = Backbone.View.extend({

    el: '#rest',

    events: {
        'click': "rest"
    },

    rest: atomic.atomicOperation(function(event) {

        if(!this.mesh)
            this.mesh = this.model.asset();
        console.log(this.mesh.basic_exp);
        console.log(this.mesh.restore_exp);

        var pc_value = this.model.get("pcValueAll");

        // for(var i = this.mesh.max_pc; i < this.mesh.max_pc + this.mesh.max_exp; i++) {
        //     var exp_i = i - this.mesh.max_pc;
        //     pc_value[i] += this.mesh.restore_exp[exp_i];
        //     this.mesh.restore_exp[exp_i] = 0;
        // }

        this.model.set("pcValuePre", _.clone(pc_value));
        this.model.set("pcValueAll", _.clone(pc_value.fill(0)));

        this.model.trigger('needUpdate');
    })
});


export default Backbone.View.extend({

    el: '#toolbar',

    initialize: function() {
        this.lmSizeSlider = new LandmarkSizeSlider({
            model: this.model
        });
        this.connectivityToggle = new ConnectivityToggle({
            model: this.model
        });
        this.editingToggle = new EditingToggle({
            model: this.model
        });

        if (this.model.meshMode() || this.model.modelMode()) {
            this.textureToggle = new TextureToggle({
                model: this.model
            });
            if (this.model.modelMode()) {

                this.pcSlider = new PCSlider({
                    model: this.model
                });
                this.pcSelect = new PCSelect({
                    model: this.model
                });
                this.pcSample = new PCSample({
                    model: this.model
                });

                this.pcRest = new PCRest({
                    model: this.model
                });
            }
        } else {
            // in image mode, we shouldn't even have these controls.
            this.$el.find('#textureRow').css("display", "none");
        }
        this.autosaveToggle = new AutoSaveToggle({
            model: this.model
        });
    }

});
