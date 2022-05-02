// Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Asset Booking', {
	refresh: function(frm) {
		var doc = frm.doc;

		if (doc.docstatus == 1) {
			frm.add_custom_button(__("Create Asset Issue"), () => {
				frm.trigger("create_asset_issue")
			}, __("Create"))
		}
		frm.trigger("add_table_desc");
	},

	before_save: function(frm) {
		var doc = frm.doc
		/* just add "no copy" at field settings"
		// if copied from other asset booking, the logs also will be copied over, so set the logs as null before save
		if (frm.is_new() && doc.booking_items) doc.booking_items.map(o => { 
			return Object.assign(o, {asset_booking_log: null})
		})
		*/
		if (!doc.booking_items) return
		frm.call("check_booking_items_conflict",{  // one remote call to update whole table 
			booking_items: doc.booking_items
		}).then( r => {
			if (r.message) {
				doc.booking_items = r.message
			}
		})
	},
	
	before_submit: function(frm) {
		var doc = frm.doc;
		let available = doc.booking_items.map(o => {return o.available})
		let some_unavailable = available.some(bool => {return !bool})
		if (some_unavailable) {
			frappe.throw(__("Some assets are not available for booking"))
		}
	},
	
	create_asset_issue: function(frm) {
		frappe.model.open_mapped_doc({
			method: "erpnext.assets.doctype.asset_journal.asset_journal.create_asset_issue",
			frm: cur_frm
		})
	},

	project: function(frm) {
		var doc = frm.doc;
		for (let item of doc.booking_items) {
			frappe.model.set_value("Asset Booking Items",item.name,"project",doc.project)
		}
	},

	requesting_employee: function(frm){
		var doc = frm.doc;
		for (let item of doc.booking_items) {
			frappe.model.set_value("Asset Booking Items",item.name,"requesting_employee",doc.requesting_employee)
		}
	},

	add_table_desc: function(frm) {
		var doc = frm.doc;
		if (doc.docstatus != 0) return;
		for (let item of doc.booking_items) {
			let html_element = $(`[data-name="${item.asset}"]`) // *frm.set_indicator_formatter changes default html elements. So instead indicator color class is forced manually

			if (item.docstatus == 0 && item.available) {
				html_element.attr("class","indicator green")
			} 
			else if (item.docstatus == 0 && !item.available) {
				html_element.attr("title",`${item.remarks ? item.remarks : "Unknown reason"}`) // see above *
				html_element.attr("class","indicator red")
			} 
			else {
				html_element.attr("class","indicator grey")
			}
		}
	},
});

frappe.ui.form.on('Asset Booking Items',{ 
	asset: function(frm, cdt, cdn) {
		var doc = frm.doc;
		if (!doc.booking_items) return;
		let assets = doc.booking_items.map(o => { return o.asset })
		let item = frappe.get_doc(cdt, cdn)
		let same_items = assets.filter(a => { return a == item.asset})
		if (same_items.length > 1) {
			const editable_fields = ["asset","current_location","from_date","to_date","required_location" ]
			for (let key of editable_fields) {
				frappe.model.set_value(cdt, cdn, key, null);
			}
			frappe.throw(__("Asset already in table"));
		}
	},

	from_date: function (frm, cdt, cdn) {
		let row = frappe.get_doc(cdt, cdn)
		if (row.asset && row.from_date) {
			frm.call("check_asset_availability", { // asset from_date > available_date
				asset: row.asset,
				from_date: row.from_date
			}).then(r => {
				if (r.message) {
					frappe.msgprint({
						title: __("Warning"),
						indicator: "orange",
						message: __(r.message.err_msg)
					})
					frappe.model.set_value(cdt, cdn, "from_date", null);
				}
			})
		} else {
			frappe.model.set_value(cdt, cdn, "from_date", row.from_date); // set_value for latest date, else "before_save => check_booking_items_conflict" gets old date
		}
	},

	to_date: function (frm, cdt, cdn) {
		let row = frappe.get_doc(cdt, cdn)
		if (row.to_date && row.to_date < row.from_date) {
			frappe.msgprint({
				title: __("Warning"),
				indicator: "orange",
				message: __(`Ending time must be later than <b>${row.from_date}</b>`)
			})
			frappe.model.set_value(cdt, cdn, "to_date", null);
		} else {
			frappe.model.set_value(cdt, cdn, "to_date", row.to_date); // set_value for latest date, else "before_save => check_booking_items_conflict" gets old date
		}
	},

	booking_items_add: function(frm,cdt,cdn) {
		if(frm.doc.project) {
			frappe.model.set_value(cdt,cdn,"project",frm.doc.project)
		}
		if(frm.doc.requesting_employee) {
			frappe.model.set_value(cdt,cdn,"requesting_employee",frm.doc.requesting_employee)
		}
	}
});
