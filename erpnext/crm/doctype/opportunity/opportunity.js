// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

{% include 'erpnext/selling/sales_common.js' %}
frappe.provide("erpnext.crm");

cur_frm.email_field = "contact_email";
frappe.ui.form.on("Opportunity", {
	setup: function (frm) {
		frm.custom_make_buttons = {
			'Quotation': 'Quotation',
			'Supplier Quotation': 'Supplier Quotation'
		},

			frm.set_query("opportunity_from", function () {
				return {
					"filters": {
						"name": ["in", ["Customer", "Lead"]],
					}
				}
			});

		if (frm.doc.opportunity_from && frm.doc.party_name) {
			frm.trigger('set_contact_link');
		}
	},

	onload_post_render: function (frm) {
		frm.get_field("items").grid.set_multiple_add("item_code", "qty");
	},

	party_name: function (frm) {
		frm.toggle_display("contact_info", frm.doc.party_name);
		frm.trigger('set_contact_link');

		if (frm.doc.opportunity_from == "Customer") {
			erpnext.utils.get_party_details(frm);
		} else if (frm.doc.opportunity_from == "Lead") {
			erpnext.utils.map_current_doc({
				method: "erpnext.crm.doctype.lead.lead.make_opportunity",
				source_name: frm.doc.party_name,
				frm: frm
			});
		}
	},

	onload_post_render: function (frm) {
		frm.get_field("items").grid.set_multiple_add("item_code", "qty","basic_rate"); //Max add basic_rate
	},

	with_items: function (frm) {
		frm.trigger('toggle_mandatory');
	},

	customer_address: function (frm, cdt, cdn) {
		erpnext.utils.get_address_display(frm, 'customer_address', 'address_display', false);
	},

	contact_person: erpnext.utils.get_contact_details,

	opportunity_from: function (frm) {
		frm.toggle_reqd("party_name", frm.doc.opportunity_from);
		frm.trigger("setup_opportunity_from");
		frm.set_value("party_name", "");
	},

	setup_opportunity_from: function (frm) {
		frm.trigger('setup_queries');
		frm.trigger("set_dynamic_field_label");
	},

	refresh: function (frm) {
		var doc = frm.doc;
		frm.trigger("setup_opportunity_from");
		frm.trigger('toggle_mandatory');
		erpnext.toggle_naming_series();

		if (!doc.__islocal && doc.status !== "Lost") {
			if (doc.with_items) {
				frm.add_custom_button(__('Supplier Quotation'),
					function () {
						frm.trigger("make_supplier_quotation")
					}, __('Create'));
			}

			frm.add_custom_button(__('Quotation'),
				cur_frm.cscript.create_quotation, __('Create'));

			if (doc.status !== "Quotation") {
				frm.add_custom_button(__('Lost'), () => {
					frm.trigger('set_as_lost_dialog');
				});
			}
		}

		if (!frm.doc.__islocal && frm.perm[0].write && frm.doc.docstatus == 0) {
			if (frm.doc.status === "Open") {
				frm.add_custom_button(__("Close"), function () {
					frm.set_value("status", "Closed");
					frm.save();
				});
			} else {
				frm.add_custom_button(__("Reopen"), function () {
					frm.set_value("lost_reasons", [])
					frm.set_value("status", "Open");
					frm.save();
				});
			}
		}
	},

	set_contact_link: function (frm) {
		if (frm.doc.opportunity_from == "Customer" && frm.doc.party_name) {
			frappe.dynamic_link = { doc: frm.doc, fieldname: 'party_name', doctype: 'Customer' }
		} else if (frm.doc.opportunity_from == "Lead" && frm.doc.party_name) {
			frappe.dynamic_link = { doc: frm.doc, fieldname: 'party_name', doctype: 'Lead' }
		}
	},

	set_dynamic_field_label: function (frm) {

		if (frm.doc.opportunity_from) {
			frm.set_df_property("party_name", "label", frm.doc.opportunity_from);
		}
	},

	make_supplier_quotation: function (frm) {
		frappe.model.open_mapped_doc({
			method: "erpnext.crm.doctype.opportunity.opportunity.make_supplier_quotation",
			frm: cur_frm
		})
	},

	toggle_mandatory: function (frm) {
		frm.toggle_reqd("items", frm.doc.with_items ? 1 : 0);
	}
})

// TODO commonify this code
erpnext.crm.Opportunity = frappe.ui.form.Controller.extend({
	onload: function () {

		if (!this.frm.doc.status) {
			frm.set_value('status', 'Open');
		}
		if (!this.frm.doc.company && frappe.defaults.get_user_default("Company")) {
			frm.set_value('company', frappe.defaults.get_user_default("Company"));
		}
		if (!this.frm.doc.currency) {
			frm.set_value('currency', frappe.defaults.get_user_default("Currency"));
		}

		this.setup_queries();
	},

	setup_queries: function () {
		var me = this;

		if (this.frm.fields_dict.contact_by.df.options.match(/^User/)) {
			this.frm.set_query("contact_by", erpnext.queries.user);
		}

		me.frm.set_query('customer_address', erpnext.queries.address_query);

		this.frm.set_query("item_code", "items", function () {
			return {
				query: "erpnext.controllers.queries.item_query",
				filters: { 'is_sales_item': 1 }
			};
		});

		me.frm.set_query('contact_person', erpnext.queries['contact_query'])

		if (me.frm.doc.opportunity_from == "Lead") {
			me.frm.set_query('party_name', erpnext.queries['lead']);
		}
		else if (me.frm.doc.opportunity_from == "Customer") {
			me.frm.set_query('party_name', erpnext.queries['customer']);
		}
	},

	create_quotation: function () {
		frappe.model.open_mapped_doc({
			method: "erpnext.crm.doctype.opportunity.opportunity.make_quotation",
			frm: cur_frm
		})
	}
});

$.extend(cur_frm.cscript, new erpnext.crm.Opportunity({ frm: cur_frm }));

cur_frm.cscript.item_code = function (doc, cdt, cdn) {
	var d = locals[cdt][cdn];
	if (d.item_code) {
		return frappe.call({
			method: "erpnext.crm.doctype.opportunity.opportunity.get_item_details",
			args: { "item_code": d.item_code },
			callback: function (r, rt) {
				if (r.message) {
					$.each(r.message, function (k, v) {
						frappe.model.set_value(cdt, cdn, k, v);
					});
					refresh_field('image_view', d.name, 'items');
				}
			}
		})
	}
}

const custom_tables = [
	'Material Costing',
	'Manpower Costing',
	'Tools Costing',
	'Transport Costing',
	'Accommodation Costing',
	'Other Costing',
]

for (let t of custom_tables) {
	let event_response = {
		qty: calc_row,
		unit_price: calc_row,
		qty_remove: calc_table,
		unit_price_remove: calc_table,
	}
	switch (t) {
		case "Material Costing":
			event_response.material_costing_remove = calc_table
			break;
		case "Manpower Costing":
			event_response.manpower_costing_remove = calc_table
			break;
		case "Tools Costing":
			event_response.tools_costing_remove = calc_table
			break;
		case "Transport Costing":
			event_response.transport_costing_remove = calc_table
			break;
		case "Accommodation Costing":
			event_response.accommodation_costing_remove = calc_table
			break;
		case "Other Costing":
			event_response.other_costing_remove = calc_table
			break;
	}
	frappe.ui.form.on(t, event_response)
}

function calc_row(frm, cdt, cdn) {
	let row = frappe.get_doc(cdt, cdn);
	frappe.model.set_value(cdt, cdn, "subtotal", (row.qty || 0) * (row.unit_price || 0))
	calc_table(frm, cdt)
}

function calc_table(frm, cdt) {
	//table summaries:
	let table;
	let field_name;
	if (cdt == "Material Costing") {
		table = frm.doc.material_costing
		field_name = "total_material_cost"
	}
	else if (cdt == "Manpower Costing") {
		table = frm.doc.manpower_costing
		field_name = "total_manpower_cost"
	}
	else if (cdt == "Tools Costing") {
		table = frm.doc.tools_costing
		field_name = "total_tools_cost"
	}
	else if (cdt == "Transport Costing") {
		table = frm.doc.transport_costing
		field_name = "total_transport_cost"
	}
	else if (cdt == "Accommodation Costing") {
		table = frm.doc.accommodation_costing
		field_name = "total_accommodation_cost"
	}
	else if (cdt == "Other Costing") {
		table = frm.doc.other_costing
		field_name = "total_others_cost"
	}
	//
	let total = table.reduce((a, b) => {
		return a + b.subtotal
	}, 0)
	frm.set_value(field_name, total);
}

function onchange_table_total_costing(frm) {
	let f = frm.doc;
	let total = 0;
	total += f.total_material_cost + f.total_manpower_cost + f.total_tools_cost + f.total_transport_cost + f.total_accommodation_cost + f.total_others_cost
	let admin_cost = total * 2.5 / 100;
	frm.set_value({
		material_cost: frm.doc.total_material_cost || 0,
		manpower_cost: frm.doc.total_manpower_cost || 0,
		tools_equipment_cost: frm.doc.total_tools_cost || 0,
		transport_cost: frm.doc.total_transport_cost || 0,
		accommodation_cost: frm.doc.total_accommodation_cost || 0,
		others_cost: frm.doc.total_others_cost || 0,
		admin_cost: admin_cost,
		total_cost: total + admin_cost,
	})
}

frappe.ui.form.on("Opportunity", {
	total_material_cost: onchange_table_total_costing,
	total_manpower_cost: onchange_table_total_costing,
	total_tools_cost: onchange_table_total_costing,
	total_transport_cost: onchange_table_total_costing,
	total_accommodation_cost: onchange_table_total_costing,
	total_others_cost: onchange_table_total_costing,
})
