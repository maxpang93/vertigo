// Copyright (c) 2017, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Asset Maintenance Log', {
	refresh: function(frm) {
		var me = frm;
		frm.add_custom_button(__("Test"), async () => {
			console.log("testing")
			let res = await frm.call({
				doc: me.doc,
				method: "test"
			})
			console.log(res)
		})
	},

	asset_maintenance: (frm) => {
		/*
		frm.set_query('task', function(doc) {
			return {
				query: "erpnext.assets.doctype.asset_maintenance_log.asset_maintenance_log.get_maintenance_tasks",
				filters: {
					'asset_maintenance': doc.asset_maintenance
				}
			};
		});
		*/
		frm.set_query("maintenance_schedule", function(doc){
			return {
				filters: {
					"parent": doc.asset_maintenance
				}
			}
		})
	}
});