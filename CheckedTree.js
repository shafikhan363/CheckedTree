/**
 * Tree Extension with a set of configurable features mentioned below
 * 1. ExpandAll/Collapse All
 *        Renders toolbar buttons which expand/collapses the entire tree
 *        Use @showExpandAll Config property for 'ExpandAll' button
 *        Use @showCollapseAll Config property for 'CollapseAll' button
 *
 * 2. Global checkbox to turn on/off all the tree nodes.
 *        The same checkbox would serve as an indication to reflect whether all the nodes are checked
 *        Use @showAllCheckbox Config property to enable this feature
 *        Use @showAllCheckboxLabel config property to set the label for that checkbox
 *
 * 3. Tri-state support
 *        Displays indeterminate state on a parent checkbox when it's children are partially checked
 *        Use @enableTriState Config property to enable this feature
 *
 */
Ext.define('Ext.vcops.chrome.widget.tree.CheckedTree', {
    extend: 'Ext.tree.Panel',
    alias: 'widget.checkedtree',

    requires: ['Ext.data.TreeStore'],

    trackMouseOver: false,

    //Default values for the config params
    config: {
        //To control the display of 'Check/Uncheck All' checkbox in the toolbar
        showAllCheckbox: false,

        //default Label for 'Check/Uncheck All' checkbox, this will only be effective
        //when showAllCheckbox property is set to true
        showAllCheckboxLabel: 'Check/Uncheck All',

        //To control the display of 'Expand All' toolbar button
        showExpandAll: false,

        //To control the display of 'Collapse All' toolbar button
        showCollapseAll: false,

        //To control the tristate feature, which shows a filled checkbox for a parent node if at least one (but not all)
        // of it's children are checked
        enableTriState: false,

        //To control the display of 'Get Checked Nodes' toolbar button
        displayCheckedNodes: false,
        bufferedRenderer: false
    },

    initComponent: function () {
        var me = this;

        if (me.getShowToolbar()) {
            Ext.apply(this, {
                tbar: [
                    // Global Check/UncheckAll checkbox which checks/unchecks all the nodes at once
                    // When user manually checks/unchecks the tree nodes, this checkbox would automatically
                    // be set to reflect the correct tree state
                    {
                        xtype: 'checkboxfield',
                        boxLabel: this.getShowAllCheckboxLabel(),
                        //itemId: 'all-access-checkbox',
                        hidden: !this.isCheckAllEnabled(),
                        scope: this,
                        listeners: {
                            change: function (field, newValue, oldValue, eOpts) {

                                var treeCmp = me;

                                treeCmp.getRootNode().cascadeBy(function () {
                                    this.set('checked', newValue);

                                    //If any of the parent nodes are in indeterminate state, turn them into checked state
                                    if (treeCmp.isTristateEnabled() && !this.isLeaf()) {
                                        var dom = treeCmp.getView().getNode(this);
                                        var el = Ext.get(dom);

                                        if (el != null) {
                                            var cbox = el.down('input');

                                            treeCmp.removeTriState(cbox);
                                        }
                                    }
                                });
                            }
                        }

                    }, {
                        xtype: 'tbfill'
                    },{
                        xtype: 'button',
                        text: bundle['roles.permisisons.expandAll'],
                        tooltip: bundle['roles.permisisons.expandAll'],
                        icon: 'images/'+colorScheme+'/i_expandAll.gif',
                        scope: this,
                        handler: this.onExpandAllClick,
                        hidden: !this.isExpandEnabled()

                    }, '-', {
                        xtype: 'button',
                        text: bundle['roles.permisisons.collapseAll'],
                        tooltip: bundle['roles.permisisons.collapseAll'],
                        icon: 'images/'+colorScheme+'/i_collapseAll.gif',
                        scope: this,
                        handler: this.onCollapseAllClick,
                        hidden: !this.isCollapseEnabled()

                    }, {
                        text: 'Get checked nodes',
                        scope: this,
                        handler: this.onCheckedNodesClick,
                        hidden: !this.getDisplayCheckedNodes()

                    }
                ]
            });
        }

        this.callParent();

        // NOTE: Get the store from the view (NodeStore), not from the tree (TreeStore).
        this.getView().getStore().on('update', this.onStoreUpdate, this);

        // NOTE: Do not use 'listeners' because the caller can override it with the config.
        this.on({
            scope: this,

            // OnChange event handler for the checkboxes corresponding to the tree nodes
            checkchange: function (node, isChecked) {

                // Propagate change downwards (for all children of current node).
                if (node.hasChildNodes()) {
                    //pass this tree component as scope, so that the Tree level API would be available on 'this' object inside
                    //recursive function setChildrenCheckedStatus. By doing this, we can also get rid of arguments.callee
                    node.eachChild(this.setChildrenCheckedStatus, this);
                }

                //When a node with indeterminate state is checked, remove it's 'tristate' model
                if (isChecked && node.get('tristate')) {
                    node.set('tristate', false);
                }

                //propagate change up to the parent
                this.updateParentCheckedStatus(node);

                //update the global CheckAll checkbox only if the corresponding config property is set to true
                if (this.isCheckAllEnabled()) {
                    this.updateAllCheckbox();
                }
            },

            load: function (tree, node, records, successful, eopts) {
                Ext.Function.defer(function() {
                    //check parent nodes if all of it's children are checked
                    var rootNode = tree.getRootNode();
                    if (rootNode) {
                        rootNode.cascadeBy(function (node) {
                            if (node.isLeaf()) {
                            this.updateParentCheckedStatus(node);
                            }
                        }, this);

                        //update the global CheckAll checkbox only if the corresponding config property is set to true
                        if (this.isCheckAllEnabled()) {
                            //check if administrative access checkbox has to be checked
                            //we can do this by checking the top layer parents
                            this.updateAllCheckbox();
                        }
                    }
                }, 500, this);
            },

            //this listener gets called after a node is expanded, itemExpand listener could not set indeterminate style on the
            //children of node as they were not even UI view. So the right place to apply the tristate style for those nodes is
            //afterItemExpand listener, in which the complete UI would be visible
            afterItemExpand: function(node, index, item, eOpts) {

                if(this.isTristateEnabled()) {
                    var tree = this;

                    node.cascadeBy(function(n){

                        if(n.get('tristate')) {
                            var domNode = tree.getView().getNode(n);

                            if(!tree.hasTriState(domNode)) {
                                if(Ext.get(domNode)) {
                                    tree.addTriState(Ext.get(domNode).down('input'));
                                }
                            }
                        }
                    });
                }
            }
        });
    },

    /**
     * toggle parent and children state when checking/unchecking node
     *
     * @param {Ext.data.NodeInterface} node The tree node whose deepest node is to be found out
     */
    findTheDeepestNode: function(node) {
        var deepestNode = node;

        node.cascadeBy(function(n) {
            if(n.getDepth() > deepestNode.getDepth()) {
                deepestNode = n;
            }
        });

        return deepestNode;
    },

    /**
     * toggle parent and children state when checking/unchecking node
     * function to handle propagating check status down the children
     *
     * @param {Object} current The target tree node whose children are to be checked
     */
    setChildrenCheckedStatus: function (current) {
        if (current.parentNode) {
            var parent = current.parentNode;
            current.set('checked', parent.get('checked'));
        }
        if (current.hasChildNodes()) {
            //pass this tree component as scope, so that the Tree level API would be available on 'this' object inside
            //recursive function setChildrenCheckedStatus. By doing this, we can also get rid of arguments.callee
            current.eachChild(this.setChildrenCheckedStatus, this);
        }
    },

    /**
     * function handle propagating check status to the parents
     *
     * @param {Object} current The target tree node whose parents' checked status should be updated
     */
    updateParentCheckedStatus: function (current) {
        //Copy the tree reference into a variable, that way the tree can be accessed from the Anonymous inner functions too
        var tree = this;

        if (current.parentNode) {
            var parent = current.parentNode;

            // If the root is not visible, no need to go through below logic at root level
            if (!tree.rootVisible && parent == tree.getRootNode())
                return;

            var childCount = parent.childNodes.length;

            //Get the count of nodes that are checked
            var checkedCount = 0;

            // This should be set to true for a parent if any of it's children would be partially checked
            var partialFillCheck = false;

            parent.eachChild(function (n) {

                if (tree.isTristateEnabled()) {
                    var domNode = tree.getView().getNode(n);

                    //add the count only if the node is completely checked without being partially filled
                    if (n.get('checked') && !tree.hasTriState(domNode)) {
                        checkedCount++;
                    }

                    //Set the partialFillCheck if the node's checkbox is in indeterminate state, this variable would
                    //later be helpful to propogate this indeterminate state back to it's parent node below
                    if (tree.hasTriState(domNode)) {
                        partialFillCheck = true;
                    }

                    if(n.get('tristate')) {
                        partialFillCheck = true;

                        if(!tree.hasTriState(domNode)) {
                            if(Ext.get(domNode)) {
                                tree.addTriState(Ext.get(domNode).down('input'));
                            }
                        }
                    }

                } else {
                    checkedCount += (n.get('checked') ? 1 : 0);
                }
            });

            // handle the case where all the children are checked
            if (checkedCount == childCount) {

                //Check the parent node when all children are checked
                parent.set('checked', true);

                //Also remove the tristate class if it was already present
                if (tree.isTristateEnabled()) {

                    //TODO this piece of code is arleady being used down, can be moved to a private method
                    var parentDom = this.getView().getNode(parent);
                    var parentEl = Ext.get(parentDom);

                    if (parentEl != null) {
                        var cbox = parentEl.down('input');

                        tree.removeTriState(cbox);
                    }

                    // Remove the previously attained tristate from Model if all the children are checked
                    if (parent.get('tristate')) {
                        parent.set('tristate', false);
                    }
                }
            }

            // handle the case zero or more children are checked
            else {
                if (tree.isTristateEnabled()) {

                    var parentDom = this.getView().getNode(parent);
                    var parentEl = Ext.get(parentDom);

                    //Ensure that the parent is not the root node, rootVisible set to false hence there would be no DOM for root
                    //TODO to handle rootVisible:true case
                    if (parentEl != null) {
                        if (checkedCount > 0) {
                            parent.set('tristate', true);
                        }

                        var cbox = parentEl.down('input');

                        //When the children are partially checked, it can be one of these two cases
                        //  TriState permission is enabled  - display tristate checkbox on parent node
                        //  Tristate permission is disabled - uncheck the parent node
                        if (checkedCount > 0 || partialFillCheck) {
                            // Add CSS class to target checkbox, to make it look like 'filled' checkbox
                            tree.addTriState(cbox);
                        }

                        //When none are checked (checkedCount = 0 scenario), uncheck the parent node
                        else {
                            tree.removeTriState(cbox);
                            parent.set('tristate', false);

                            //Apart from removing the class name, the parent checkbox should also be unchecked
                            parent.set('checked', false);
                        }
                    } else {
                        if (checkedCount > 0 || partialFillCheck) {
                            //Also set tristate on the node model, to deal with cases where the nodes are collapses and not part of dom model
                            parent.set('tristate', true);
                        }
                    }
                } else {
                    parent.set('checked', false);
                }
            }

            tree.updateParentCheckedStatus(parent);
        }
    },


    /**
     * Updates global Check/UncheckAll checkbox if all of it's nodes are checked
     */
    updateAllCheckbox: function () {
        var tree = this;

        var rootNode = tree.getRootNode();
        var isChecked = true;
        rootNode.eachChild(function (child) {

            if (!child.get('checked') ||
                ( tree.isTristateEnabled() && tree.hasTriState(tree.getView().getNode(child)) )) {
                isChecked = false;
            }
        });

        var globalCheckAll = tree.down('toolbar').down('checkbox');

        //Suspend all events to make sure that 'onchange' event is not triggered on globalCheckAll check box
        globalCheckAll.suspendEvents(false);

        globalCheckAll.setValue(isChecked);

        //Resume the events on globalCheckAll
        globalCheckAll.resumeEvents(); //resume events now
    },

    /**
     * Adds Tristate CSS class on the checkbox
     *
     * @param {Object} checkbox The input checkbox on which tristate is to be set
     */
    addTriState : function(checkbox) {
        checkbox.addCls('x-tree-checkbox-tristate');
    },

    /**
     * Removes Tristate CSS class on the checkbox
     *
     * @param {Object} checkbox The input checkbox on which tristate is to be removed
     */
    removeTriState : function(checkbox) {
        if (checkbox.hasCls('x-tree-checkbox-tristate')) {
            checkbox.removeCls('x-tree-checkbox-tristate');
        }
    },

    /**
     * Returns true if the treeNode has Tristate CSS class on the checkbox
     *
     * @param {Object} treeNode The target tree node, which is having checkbox in it's hierarchy
     */
    hasTriState : function(treeNode) {
        var hasClass = false;

        if(treeNode) {
            //check for tristate css class in the entire tree node's innerHTML
            //TODO find out a fast & clean way to find whether node's checkbox is having the tristate CSS class
            var index = treeNode.innerHTML.indexOf('x-tree-checkbox-tristate');

            hasClass = (index != -1) ? true : false;
        }

        return hasClass;
    },

    /**
     * Finds out the list of all checked nodes and show in a popup dialog
     */
    onCheckedNodesClick: function () {
        var records = this.getView().getChecked(),
            names = [];

        Ext.Array.each(records, function (rec) {
            names.push(rec.get('text'));
        });

        Ext.MessageBox.show({
            title: 'Selected Nodes',
            msg: names.join('<br />'),
            icon: Ext.MessageBox.INFO
        });
    },

    /**
     * Expands all the nodes of the tree
     */
    onExpandAllClick: function () {
        var me = this,
            toolbar = me.down('toolbar');

        me.getEl().mask(bundle['checkedTree.expanding']);

        this.expandAll(function () {
            me.getEl().unmask();
        });
    },

    /**
     * Collapses all the nodes of the tree
     */
    onCollapseAllClick: function () {
        this.collapseAll();
    },

    /**
     * Getter method for 'showExpandAll' config property
     *
     * @return {boolean} showExpandAll
     */
    isExpandEnabled: function () {
        return this.showExpandAll;
    },

    /**
     * Getter method for 'showCollapseAll' config property
     *
     * @return {boolean} showCollapseAll
     */
    isCollapseEnabled: function () {
        return this.showCollapseAll;
    },

    /**
     * Getter method for 'showAllCheckbox' config property
     *
     * @return {boolean} showAllCheckbox
     */
    isCheckAllEnabled: function () {
        return this.showAllCheckbox;
    },

    /**
     * Getter method for 'showAllCheckboxLabel' config property
     *
     * @return {boolean} showAllCheckboxLabel
     */
    getShowAllCheckboxLabel: function () {
        return this.showAllCheckboxLabel;
    },

    /**
     * Getter method for 'enableTriState' config property
     *
     * @return {boolean} enableTriState
     */
    isTristateEnabled: function () {
        return this.enableTriState;
    },

    /**
     * Getter method for 'displayCheckedNodes' config property
     *
     * @return {boolean} displayCheckedNodes
     */
    getDisplayCheckedNodes: function () {
        return this.displayCheckedNodes;
    },

    /**
     * @return {boolean} Return true if at least one toolbar button is available.
     */
    getShowToolbar: function() {
        return this.isCheckAllEnabled() || this.isExpandEnabled() ||
               this.isCollapseEnabled() || this.getDisplayCheckedNodes();
    },

    /**
     * @private
     * Event listener for the store 'update' event.
     */
    onStoreUpdate: function (store, record, operation, modifiedFieldNames) {
        if (Ext.isEmpty(modifiedFieldNames)
                || !Ext.Array.contains(modifiedFieldNames, 'expanded')
                || !this.isTristateEnabled()) {
            return;
        }

        // Handle the three-state icon.
        var expanded = record.get('expanded');
        if (expanded) {
            // On expand
            this.onItemExpand(record);
        } else {
            // On collapse
            this.onItemCollapse(record);
        }
    },

    /**
     * Handles the three-state icon when the item is collapsed.
     */
    onItemCollapse: function(node) {
        // The collapse operation on the node wipes off the tristate that might have been set before.
        // Hence, we need to set it again by manually inspecting it's child nodes
        var allChecked = true, atLeastOneChecked = false;

        node.cascadeBy(function(n){
            var checkStatus = n.get('checked');

            allChecked = allChecked && checkStatus;
            atLeastOneChecked = atLeastOneChecked || checkStatus;
        });

        //allChecked=true scenario is unaffected even after the collapse operation
        //Just handle the case where this 'node' should be set with tristate
        if(atLeastOneChecked && !allChecked) {
            var dom   = this.getView().getNode(node);
            var domEl = Ext.get(dom);
            var cbox  = domEl.down('input');

            this.addTriState(cbox);

        }
    },

    /**
     * Handles the three-state icon when the item is expanded.
     */
    onItemExpand: function(node) {
        // The expand operation on the node wipes off the tristate that might have been set before. Hence, we need
        // to reset by calling the updateParentCheckedStatus API and passing in the deepest of it's children as input
        this.updateParentCheckedStatus(this.findTheDeepestNode(node));
    }

});
/* End of CheckTree Extension */
