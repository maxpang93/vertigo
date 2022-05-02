// Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Asset Journal', {
	/* not working
	onload: function(frm) {
		console.log("onload");
		// dashboard: hide Return dashboard items for Return doc
		var doc=frm.doc;
		let ele = $('h6:contains("Asset Return Journal")')
		if (doc.transaction_type == "Return") {
			console.log("hiding")
			ele.hide()
			ele.next().hide()
		}
		
	},
	*/
	refresh: function(frm) {
		console.log("refresh")
		var doc = frm.doc;
		//console.log(frm.page)
		
		// dashboard: hide Return dashboard items for Return doc
		((doc) => {
			let ele = $('h6:contains("Asset Return Journal")')
			if (doc.transaction_type == "Issue") {
				ele.show()
				ele.next().show()
			} else if (doc.transaction_type == "Return") {
				ele.hide()
				ele.next().hide()
			}
		})(doc)

		if (doc.docstatus == 1 && doc.transaction_type == "Issue") {
			frm.add_custom_button(__("Create Asset Return"), () => {
				frm.trigger("create_asset_return")
			}, __("Create"))
		}

		/*
		if (doc.docstatus == 0) {
			let today = frappe.datetime.nowdate();
			if (today != doc.posting_date) {
				frappe.model.set_value("Asset Journal",doc.name,"posting_date",today)
				if (doc.journal_items) {
					for (let item of doc.journal_items) {
						frappe.model.set_value("Asset Journal Items", item.name, "posting_date",today)
					}
				}
			}
		}
		*/
		
		frm.trigger("update_asset_latest_location_custodian") 
		frm.trigger("add_table_desc") // max: seems to call after "update_asset_latest_location_custodian"

		frm.page.btn_secondary.hide() //hides Cancel button		
	},
	/* just add "no copy" at field settings
	before_save: function (frm) {
		var doc = frm.doc
		if (!doc.journal_items) return
		// if copied from other asset journal, the logs also will be copied over, so set the logs as null before save
		if (frm.is_new() && doc.journal_items) doc.journal_items.map(o => { 
			return Object.assign(o, {asset_journal_log: null})
		})
	},
	*/
	before_submit: async function(frm) {
		var doc = frm.doc;
		if (!doc.journal_items) frappe.throw(__("Please add Journal Items"))

		let today = frappe.datetime.nowdate();
		if (today != doc.posting_date) {
			/* sample code from forum
			await new Promise(function(resolve, reject) {
				frappe.confirm(
					'The cost center for the entry to <b>' + frm.doc.accounts[i].account + '</b> is <b>' + frm.doc.accounts[i].cost_center + '</b>. Is this correct?',
					function() {
						var negative = 'frappe.validated = false';
						resolve(negative);
					},
					function() {
						reject();
					}
				)
			})
			*/
			await new Promise((resolve,reject) => {
				frappe.confirm('Posting Date is not Today. Are you sure you want to proceed?',
					() => {
						// action to perform if Yes is selected
						console.log("Proceed even if posting date is not Today")
						//frappe.validated = true; //doesn't work 
						let res = 'frappe.validated = true'; 
						resolve(res) // works if resolve()
					}, () => {
						// action to perform if No is selected
						console.log("Did not proceed")
						frappe.validated = false;
						frm.refresh();
					})
			})
		}
		console.log("after checking posting_date")
		
		let ok_to_submit = doc.journal_items.map(o => {return o.from_location == o.latest_location && o.from_custodian == o.latest_custodian})
		let some_not_ok = ok_to_submit.some(bool => {return !bool})
		if (some_not_ok) {
			frappe.throw(__("Some assets is <b>not</b> available at <b>Source Location</b> or <b>Current Custodian</b>"))
		}
	},

	before_cancel: function(frm) {
		frappe.throw(__("Submitted <b>Asset Movement Journal</b> cannot be cancelled. If issued, please return instead"))
	},

	transaction_type: function(frm) {
		var doc = frm.doc;
		for (let item of doc.journal_items) {
			frappe.model.set_value("Asset Journal Items", item.name, "transaction_type", doc.transaction_type)
		}
	},

	posting_date: function (frm) {
		var doc = frm.doc;
		for (let item of doc.journal_items) {
			frappe.model.set_value("Asset Journal Items", item.name, "posting_date", doc.posting_date)
		}
	},

	create_asset_return: function(frm) {
		frappe.model.open_mapped_doc({
			method: "erpnext.assets.doctype.asset_journal.asset_journal.create_asset_return",
			frm: cur_frm
		})
	},

	update_asset_latest_location_custodian: function(frm) {
		var doc = frm.doc;
		if (!doc.journal_items || doc.docstatus != 0) return;
		for (let item of doc.journal_items) {
			frappe.db.get_doc("Asset", item.asset).then(asset => {
				frappe.model.set_value("Asset Journal Items", item.name, "latest_location", asset.location)
				frappe.model.set_value("Asset Journal Items", item.name, "latest_custodian", asset.custodian)
			})
		}
	},

	add_table_desc: function(frm) {
		var doc = frm.doc;
		if (!doc.journal_items || doc.docstatus != 0) return;
		for (let item of doc.journal_items) {
			console.log(`
				latest custodian: ${item.latest_custodian} \n
				from_custodian: ${item.from_custodian} \n
				latest_location: ${item.latest_location} \n
				from_location: ${item.from_location} \n
			`)
			let from_loc_ele = $(`[data-name="${item.name}"]`).find('[data-fieldname="from_location"]').find(`[data-name="${item.from_location}"]`);
			if (item.latest_location == item.from_location) {
				from_loc_ele.attr("class", "indicator green");
			}
			else {
				from_loc_ele.attr("class", "indicator red");
				from_loc_ele.attr("title", `Asset currently at ${item.latest_location || "Unknown"}`);
			}

			let from_cus_ele = $(`[data-name="${item.name}"]`).find('[data-fieldname="from_custodian"]').find(`[data-name="${item.from_custodian}"]`);
			if (item.latest_custodian == item.from_custodian) {
				from_cus_ele.attr("class", "indicator green");
			}
			else {
				from_cus_ele.attr("class", "indicator red");
				from_cus_ele.attr("title", `Asset currently with ${item.latest_custodian || "Unknown"}`);
			}
		}
	},
});

frappe.ui.form.on('Asset Journal Items', {
	asset: function(frm, cdt, cdn) {
		let assets = frm.doc.journal_items.map(o=>{return o.asset})
		if (cdn in assets) frappe.throw(__("Asset already in table"))
		frappe.db.get_doc("Asset", row.asset).then(asset => {
			frappe.model.set_value(cdt, cdn, "from_location", asset.location)
			frappe.model.set_value(cdt, cdn, "from_custodian", asset.custodian)
		})

	},

	/* Unnecessary: if asset is not moved but only changing custodian (for example: company hostel)
	to_location: function (frm, cdt, cdn) {
		//check from_location != to_location
	},
	*/

	journal_items_add: function(frm, cdt, cdn) {
		if (frm.doc.transaction_type) {
			frappe.model.set_value(cdt, cdn, "transaction_type", frm.doc.transaction_type)
		}
		if (frm.doc.requesting_employee) {
			if (frm.doc.transaction_type == "Issue") {
				frappe.model.set_value(cdt, cdn, "to_custodian", frm.doc.requesting_employee)
			} else if (frm.doc.transaction_type == "Return") {
				frappe.model.set_value(cdt, cdn, "from_custodian", frm.doc.requesting_employee)
			}
		}
	}

})
