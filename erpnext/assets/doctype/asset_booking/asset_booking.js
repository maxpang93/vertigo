// Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Asset Booking', {
	//functions run serially in order := setup -> before_load -> onload -> refresh
	// but won't wait for previous ones to finish
	/*
	setup: () => {setTimeout(()=>{
		console.log("setup")
		},10000)
	},
	before_load: () => {setTimeout(()=>{
		console.log("before_load")
		},100)
	},
	onload: () => {setTimeout(()=>{
		console.log("onload")
		},1200)
	},
	*/
	/* doesn't work also.. refresh() won't wait for setup() to finish
	setup: async function (frm){ 
		await frm.trigger("update_latest_asset_location")
	},
	*/
	/*
	setup: async function (frm){ 
		console.log("setup")
		await frm.trigger("update_latest_asset_location_old")
	},
	*/
	refresh: async function (frm) {
		console.log("refresh")
		var doc = frm.doc;
		/*
		frm.add_custom_button(__("test"), () => {
			//erpnext.utils.test_function({frm:frm})
			frm.trigger("test_func")
		}) */
		
		if (doc.docstatus == 1) {
			/*
			frm.add_custom_button(__("Create Asset Issue"), () => {
				frm.trigger("create_asset_issue")
			}, __("Create"))
			*/
			frm.add_custom_button(__("Update Items"), () => {
				frm.trigger("update_child_items")
			})

			frm.add_custom_button(__("Issue asset"), () => { 
				frm.trigger("make_asset_issue")
			}, __("Create asset transfer"), "btn-default");

			frm.add_custom_button(__("Return asset"), () => {
				frm.trigger("make_asset_return")
			}, __("Create asset transfer"), "btn-default")
		}
		/* //doesn't work
		frappe.run_serially([
			() => {
				frm.trigger("update_latest_asset_location_old")
			}, // 1. update child table's asset current location silently
			//frm.trigger("test"), // 2. filter based on permission
			() => {
				frm.trigger("add_table_desc")
			}, // 3. 
		])
		*/
		//await frm.trigger("update_latest_asset_location_old")
		await frm.trigger("update_latest_asset_location")
		//let res = await frm.trigger("test_func")
		//console.log(res)
		frm.trigger("add_table_desc")

		
	},

	test_func: async function (frm) {
		var me = frm;
		const get_list_fields =  async (doctype) => {
			let res = await frappe.db.get_list("DocField",{
				filters:{
					parent:doctype,
					//in_list_view:1,
				},
				fields:["fieldname"],
			})
			console.log("get_list_fields => res \n",res)
		}
		let fields = await get_list_fields("Asset Booking Items")
		console.log(fields)
		return fields;
		/*
		return frappe.call({
			method: "frappe.client.get_value",
			args: {
				'doctype': 'Asset Booking Items',
				'filters': {'parent':me.doc.name },
				'fieldname':['asset','current_location','from_date']
			},
		}) */
		/*
		return frappe.call("frappe.client.get_value",{
			'doctype': 'Asset Booking Items',
			'filters': {'parent':me.doc.name },
			'fieldname':['asset','current_location','from_date']
		})
		*/
	},

	before_save: function (frm) {
		var doc = frm.doc
		/* just add "no copy" at field settings"
		// if copied from other asset booking, the logs also will be copied over, so set the logs as null before save
		if (frm.is_new() && doc.booking_items) doc.booking_items.map(o => { 
			return Object.assign(o, {asset_booking_log: null})
		})
		*/
		if (!doc.booking_items) return
		frm.call("check_booking_items_conflict", {  // one remote call to update whole table 
			booking_items: doc.booking_items
		}).then(r => {
			if (r.message) {
				doc.booking_items = r.message
			}
		})
	},

	before_submit: function (frm) {
		var doc = frm.doc;
		let available = doc.booking_items.map(o => { return o.available })
		let some_unavailable = available.some(bool => { return !bool })
		if (some_unavailable) {
			frappe.throw(__("Some assets are not available for booking"))
		}
	},

	create_asset_issue: function (frm) {
		frappe.model.open_mapped_doc({
			method: "erpnext.assets.doctype.asset_journal.asset_journal.create_asset_issue",
			frm: cur_frm
		})
	},

	make_asset_issue_old: function (frm) {
		console.log("issuing asset")
		/*
		erpnext.utils.map_current_doc({
			method: "erpnext.assets.doctype.asset_journal.asset_journal.create_asset_issue",
			source_doctype: "Asset Booking Items",
			target: frm,
			setters: [
				{
					label: __("Custodian"),
					fieldname: "custodian",
					fieldtype: "Link",
					options: "Employee",
				},
			],
			get_query_filters: {
				company: frm.doc.company
			}
		})
		*/
		let me = {}; // %^&
		me.data = [];
		const dialog = new frappe.ui.Dialog({
			title: __("Issue Items"),
			fields: [{
				fieldname: "items_to_issue",
				fieldtype: "Table",
				label: "Select Items",
				cannot_add_rows: true,
				//in_place_edit: true,
				//read_only: 1,
				//reqd: 1,
				data: me.data,
				/* //working without get_data
				get_data: () => {
					return this.data;
				}, */
				fields: [
					{
						fieldtype: "Link",
						label: __("Asset"),
						fieldname: "asset",
						options: "Asset",
						read_only: 1,
						in_list_view: 1,
					},
					{
						fieldtype: "Link",
						label: __("Custodian"),
						fieldname: "custodian",
						options: "Employee",
						read_only: 1,
						in_list_view: 1,
						in_standard_filter: 1, // not working
					},
					{
						fieldtype: "Link",
						label: __("Current Location"),
						fieldname: "current_location",
						options: "Location",
						read_only: 1,
						in_list_view: 1
					},
					{
						fieldtype: "Link",
						label: __("Required At"),
						fieldname: "required_location",
						options: "Location",
						read_only: 1,
						in_list_view: 1
					},
					{
						fieldtype: "Datetime",
						label: __("Required From"),
						fieldname: "from_date",
						read_only: 1,
						in_list_view: 1
					},
					{
						fieldtype: "Datetime",
						label: __("Required To"),
						fieldname: "to_date",
						read_only: 1,
						in_list_view: 1
					},
				]
			}],
			primary_action_label: "Issue Asset",
			primary_action() {
				let selected_items = dialog.fields_dict.items_to_issue.grid.get_selected_children();
				console.log(selected_items);

				if (selected_items.length == 0) {
					frappe.throw({ message: 'Please select Items from the Table', title: __('Items Required'), indicator: 'blue' })
				}

				dialog.hide()

				return frm.call({
					method: "erpnext.assets.doctype.asset_journal.asset_journal.make_asset_issue",
					freeze: true,
					freeze_message: __("Creating Asset Issue ..."),
					args: {
						"asset_booking": frm.doc.name,
						"selected_items": selected_items,
					},
					callback: function (r) {  ///trivial
						if (r) {
							console.log(r) // r = { message: "AST-BK-2022-00056" }  *remember to "submit" doc
							// =>  please redirect to asset journal form
							// OR show popup message and user click to view form
						}
					}
				})
			},
		})

		//let count = 0
		for (let d of frm.doc.booking_items) {
			//count++
			let total_issued, total_returned;
			console.log("1.1")
			frm.call("get_total_asset_issued_and_returned",{
				asset: d.asset
			}).then( r => {
				if (r.message) {
					total_issued = r.message.total_issued;
					total_returned = r.message.total_returned;
				}
			})
			console.log("1.2")
			//if (count > 3) total_issued = 1 
			console.log(total_issued, total_returned, total_issued !== total_returned)
			if (total_issued !== total_returned) continue; //logically, only returned asset can be issued again. Therefore, [mathematically] total_issued - total_returned = {0,1} 
			console.log("continuing")
			console.log("1.3")
			dialog.fields_dict.items_to_issue.df.data.push({
				"docname": d.name,
				"name": d.name,
				"asset": d.asset,
				"custodian": d.custodian,
				"current_location": d.current_location,
				"required_location": d.required_location,
				"from_date": d.from_date,
				"to_date": d.to_date,
				"__checked": 1,
			});
			console.log("1.4")
		}
		console.log("2")
		me.data = dialog.fields_dict.items_to_issue.df.data;
		dialog.fields_dict.items_to_issue.grid.refresh();
		dialog.show()
	},

	make_asset_issue: function (frm) {
		console.log("issuing asset")
		let opts = {
			///method: ()=>{console.log("make_asset_issue 'method'")}, //unused
			source_doctype: "Asset Booking Items",
			target: frm,
			setters: [
				{
					label: __("Asset"),
					fieldname: "asset",
					fieldtype: "Link",
					options: "Asset",
				},
				{
					label: __("Custodian"),
					fieldname: "custodian",
					fieldtype: "Link",
					options: "Employee",
				},
				{
					label: __("Required At"),
					fieldname: "required_location",
					fieldtype: "Link",
					options: "Location",
				},
				/*
				{
					label: __("Required From"),
					fieldname: "from_date",
					fieldtype: "Datetime",
				},
				*/
			], 
			get_query_filters: {
				parent: frm.doc.name
			}
		}

		var d = new frappe.ui.form.SelectChildrenDialog({
			//me: this, //$%* to close dialog, but not working
			doctype: opts.source_doctype,
			target: opts.target,
			date_field: "to_date",
			setters: opts.setters,
			resize: true,

			get_query: opts.get_query_filters ? function() {
				return {
					filters: opts.get_query_filters
				}
			} : () => { console.log("no query filters") },

			skip_row: function() { //skip displaying row if true
				//let skip_row = Math.random() < 0.5 ? true : false;
				let skip_row=false; //max continue here (2.)
				return skip_row
			},

			post_selection_action_label: "Issue Asset",
			post_selection_action: function (selections, args) {
				console.log(`MultiSelectDialog: actions() => selections:\t${selections} args:\t${args} `); //"args" unused, need to remove
				frappe.call({
					method: "erpnext.assets.doctype.asset_journal.asset_journal.make_asset_issue",
					freeze: true,
					freeze_message: __("Creating Asset Issue ..."),
					args: {
						"asset_booking": frm.doc.name,
						"selected_items": selections,
					},
					
					callback: function (r) {  ///trivial
						if (r) {
							console.log(r) // r = { message: "AST-BK-2022-00056" }  *remember to "submit" doc
							// =>  please redirect to asset journal form
							// OR show popup message and user click to view form
						}
					} 
					/*
					callback: function () {
						frm.reload_doc();
					} */
				})
				//me.hide(); //$%* close inside SelectChildrenDialog instead
				//refresh_field("booking_items");
			}
		})
	},

	make_asset_return: function (frm) { 
		console.log("returning asset")
		let opts = {
			//method: ()=>{console.log("make_asset_return 'method'")}, //unused
			source_doctype: "Asset Booking Items",
			target: frm,
			setters: [
				{
					label: __("Asset"),
					fieldname: "asset",
					fieldtype: "Link",
					options: "Asset",
				},
				{
					label: __("Custodian"),
					fieldname: "custodian",
					fieldtype: "Link",
					options: "Employee",
				},
				{
					label: __("Required At"),
					fieldname: "required_location",
					fieldtype: "Link",
					options: "Location",
				},
				/*
				{
					label: __("Required From"),
					fieldname: "from_date",
					fieldtype: "Datetime",
				},
				*/
			], 
			get_query_filters: {
				parent: frm.doc.name
			}
		}
		//var d = new frappe.ui.form.MultiSelectDialog({  ///max fucking annoying.. need to rewrite MultiSelectDialog.js for our purposes
		var d = new frappe.ui.form.SelectChildrenDialog({
			doctype: opts.source_doctype,
			target: opts.target,
			date_field: "from_date",
			setters: opts.setters,
			resize: true,
			get_query: opts.get_query_filters ? function() {
				return {
					filters: opts.get_query_filters
				}
			} : () => { console.log("no query filters") },
			post_selection_action_label: "Return Asset",
			post_selection_action: function (selections, args) {
				console.log(`MultiSelectDialog: actions() => selections:\t${selections} args:\t${args} `);

			}
		})

		/*
		let me = {}; // %^&
		me.data = [];
		const dialog = new frappe.ui.Dialog({
			title: __("Select Items"),
			fields: [{
				fieldname: "items_to_return",
				fieldtype: "Table",
				label: "Select Items",
				read_only: 1,
				cannot_add_rows: true,
				in_place_edit: true,
				data: me.data,
				get_data: () => {
					return this.data;
				},
				fields: [
					{
						fieldtype: "Link",
						label: __("Asset"),
						fieldname: "asset",
						options: "Asset",
						read_only: 1,
						in_list_view: 1,
					},
					{
						fieldtype: "Link",
						label: __("Custodian"),
						fieldname: "custodian",
						options: "Employee",
						read_only: 1,
						in_list_view: 1,
						in_standard_filter: 1, // not working
					},
					{
						fieldtype: "Link",
						label: __("Current Location"),
						fieldname: "current_location",
						options: "Location",
						read_only: 1,
						in_list_view: 1
					},
					{
						fieldtype: "Link",
						label: __("Required At"),
						fieldname: "required_location",
						options: "Location",
						read_only: 1,
						in_list_view: 1
					},
					{
						fieldtype: "Datetime",
						label: __("Required From"),
						fieldname: "from_date",
						read_only: 1,
						in_list_view: 1
					},
					{
						fieldtype: "Datetime",
						label: __("Required To"),
						fieldname: "to_date",
						read_only: 1,
						in_list_view: 1
					},
				]
			}],
			primary_action_label: "Return Asset",
			primary_action() {
				let selected_items = dialog.fields_dict.items_to_return.grid.get_selected_children();
				if (selected_items.length == 0) {
					frappe.throw({ message: 'Please select Items from the Table', title: __('Items Required'), indicator: 'blue' })
				}

				dialog.hide()

				return frape.call({
					method: "erpnext.assets.doctype.asset_transfer.asset_transfer.make_asset_return", //max pls work out the function
					freeze: true,
					freeze_message: __("Creating Asset Return ..."),
					args: {
						"source_name": frm.doc.name,
						"selected_items": selected_items,
					},
					callback: function (r) {  ///trivial
						if (r) {
							console.log(r)
						}
					}
				})
			},
		})
		frm.doc["booking_items"].forEach(d => {
			dialog.fields_dict.items_to_return.df.data.push({
				"docname": d.name,
				"name": d.name,
				"asset": d.asset,
				"custodian": d.custodian,
				"current_location": d.current_location,
				"required_location": d.required_location,
				"from_date": d.from_date,
				"to_date": d.to_date,
				"__checked": 1,
			});
			me.data = dialog.fields_dict.items_to_return.df.data;
			dialog.fields_dict.items_to_return.grid.refresh();
		});
		dialog.show() 
		*/
	}, 

	project: function (frm) {
		var doc = frm.doc;
		for (let item of doc.booking_items) {
			frappe.model.set_value("Asset Booking Items", item.name, "project", doc.project)
		}
	},

	/* //tables' employee changed to multiple different custodian
	requesting_employee: function (frm) {
		var doc = frm.doc;
		for (let item of doc.booking_items) {
			frappe.model.set_value("Asset Booking Items", item.name, "requesting_employee", doc.requesting_employee)
		}
	},
	*/
	update_latest_asset_location: async function(frm) {
		console.log("update_latest_asset_location")
		var me = frm;
		if (!frm.doc.booking_items) return;
		for (let item of frm.doc.booking_items) {
			let asset = await frappe.db.get_doc("Asset",item.asset);
			frappe.model.set_value("Asset Booking Items", item.name, "current_location", asset.location);
		}
	},

	update_latest_asset_location_old: async function(frm) {
		console.log("update_latest_asset_location")
		var me = frm;
		/* //doesn't work 1.
		frappe.call({
			method: "erpnext.assets.doctype.asset_booking.asset_booking.update_latest_asset_location", //max continue here (1.)
			args: {
				name: me.doc.name
			},
			callback: function () {
				console.log("finished executing update_latest_asset_location")
				me.reload_doc()
			}
		})
		*/ 
		 //doesn't work 2.
		let res = await frm.call("update_latest_asset_location",{ name: me.doc.name })
		if (res) {
			console.log(res)
			console.log("finished executing update_latest_asset_location: finishh")
			frm.refresh() //called in setup(), NEVER in refresh(), else infinite loop
			//me.clear_table("booking_items")
			//me.refresh_field("booking_items")
			//me.refresh_field("booking_items")
			//me.doc.booking_items.refresh();
		}
	
		/* //doesn't work 3.
		frm.call("update_latest_asset_location",{ name: me.doc.name}).then(()=>{
			console.log("finished executing update_latest_asset_location")
			//me.reload_doc() //infinite loop
			//me.refresh()
		})
		*/
	},

	add_table_desc: function (frm) {
		try {
			console.log(moment().format(), "=> moment.js is working");	// proves moment.js is working
		} catch (e) {
			console.log("moment.js is not working. Error => ", e)
		}

		var doc = frm.doc;
		//if (doc.docstatus != 0) return;
		for (let item of doc.booking_items) {
			let row_html = $(`[data-name="${item.name}"]`)

			if (item.asset) {
				let asset_html = $(`[data-name="${item.asset}"]`) // *frm.set_indicator_formatter changes default html elements. So instead indicator color class is forced manually
				if (item.docstatus == 0 && item.available) {
					asset_html.attr("class", "indicator green")
					asset_html.attr("title", `${item.remarks || ''}`)
				}
				else if (item.docstatus == 0 && !item.available) {
					asset_html.attr("class", "indicator red")
					asset_html.attr("title", `${item.remarks ? item.remarks : "Unknown reason"}`) // see above *
				}
				else {
					asset_html.attr("title", `${item.remarks || ''}`) // submitted/cancelled doc shows asset_name for viewing convenience
				}
			}

			const format_AMPM = (date) => {
				return moment(date).format("YYYY-MM-DD hh:mm A")
			}

			let from_date_html = row_html.find('[data-fieldname="from_date"]');
			if (item.from_date) {
				from_date_html.attr("title", format_AMPM(item.from_date))
			} else {
				from_date_html.removeAttr("title") // ** remove title if field empty. Frappe "refresh" doesn't remove custom attributes
			}

			let to_date_html = row_html.find('[data-fieldname="to_date"]');
			if (item.to_date) {
				to_date_html.attr("title", format_AMPM(item.to_date))
			} else {
				to_date_html.removeAttr("title") // **
			}

			let custodian_html = row_html.find('[data-fieldname="custodian"]');
			if (item.custodian) {
				frappe.db.get_doc("Employee", item.custodian).then(doc => {
					custodian_html.attr("title", doc.employee_name)
				})
				/*
				let doc = frappe.get_doc("Employee", item.custodian); // return None.. 
				row_html.find('[data-fieldname="custodian"]').attr("title",doc.employee_name);
				*/
			} else {
				custodian_html.removeAttr("title") // **
			}
		}
	},

	update_child_items: function (frm) {
		console.log("updating child items")
		let me = {} // %^& "this" is undefined, somehow.. replaced with dummy variable "me"
		const cannot_add_row = true;
		const child_docname = "booking_items";
		const child_doctype = "Asset Booking Items"
		const child_meta = frappe.get_meta(`${child_doctype}`);

		//this.data = [] // %^&
		me.data = [];
		
		// fields to change 
		const fields = [{
			fieldtype: "Link",
			label: __("Asset"),
			fieldname: "asset",
			options: "Asset",
			in_list_view: 1,
			//on_delete: () => {} //max
		}, {
			fieldtype: "Link",
			label: __("Custodian"),
			fieldname: "custodian",
			options: "Employee",
			in_list_view: 1,
			//in_standard_filter: 1, //not working. Filter's block won't appear
		}, {
			fieldtype: "Link",
			label: __("Required At"),
			fieldname: "required_location",
			options: "Location",
			in_list_view: 1,
			/*onchange: () => {
				//max
			} */
		}, {
			fieldtype: "Datetime",
			label: __("Required From"),
			fieldname: "from_date",
			in_list_view: 1,
			/* onchange: () => {
				//max
			} */
		}, {
			fieldtype: "Datetime",
			label: __("Required To"),
			fieldname: "to_date",
			in_list_view: 1,
			/* onchange: () => {
				//max
			} */
		}, {
			fieldtyoe: "Link",
			label: __("Booking Log"),
			fieldname: "asset_booking_log",
			in_list_view: 1,
			options: "Asset Booking Log",
			read_only: 1,
		}];

		const dialog = new frappe.ui.Dialog({
			title: __("Update Items"),
			fields: [
				{
					fieldname: "trans_items",
					fieldtype: "Table",
					label: "Items",
					cannot_add_rows: cannot_add_row,
					//in_place_edit: true,
					read_only: 1,
					//reqd: 1,
					data: me.data,
					get_data: () => {
						return this.data;
					},
					fields: fields
				},
			],
			primary_action: function () {
				console.log("primary action.. haha") //max
			},
			primary_action_label: __("Update")
		})
		frm.doc["booking_items"].forEach(d => {
			dialog.fields_dict.trans_items.df.data.push({
				"docname": d.name,
				"name": d.name,
				"asset": d.asset,
				"custodian": d.custodian,
				"required_location": d.required_location,
				"from_date": d.from_date,
				"to_date": d.to_date,
				//"__checked": 1,
			});
			me.data = dialog.fields_dict.trans_items.df.data;
			dialog.fields_dict.trans_items.grid.refresh();
		});
		dialog.show()
	},

	/*
	erpnext.utils.map_current_doc = function(opts) {
	if(opts.get_query_filters) {
		opts.get_query = function() {
			return {filters: opts.get_query_filters};
		}
	}
	var _map = function() {
		if($.isArray(cur_frm.doc.items) && cur_frm.doc.items.length > 0) {
			// remove first item row if empty
			if(!cur_frm.doc.items[0].item_code) {
				cur_frm.doc.items = cur_frm.doc.items.splice(1);
			}

			// find the doctype of the items table
			var items_doctype = frappe.meta.get_docfield(cur_frm.doctype, 'items').options;

			// find the link fieldname from items table for the given
			// source_doctype
			var link_fieldname = null;
			frappe.get_meta(items_doctype).fields.forEach(function(d) {
				if(d.options===opts.source_doctype) link_fieldname = d.fieldname; });

			// search in existing items if the source_name is already set and full qty fetched
			var already_set = false;
			var item_qty_map = {};

			$.each(cur_frm.doc.items, function(i, d) {
				opts.source_name.forEach(function(src) {
					if(d[link_fieldname]==src) {
						already_set = true;
						if (item_qty_map[d.item_code])
							item_qty_map[d.item_code] += flt(d.qty);
						else
							item_qty_map[d.item_code] = flt(d.qty);
					}
				});
			});

			if(already_set) {
				opts.source_name.forEach(function(src) {
					frappe.model.with_doc(opts.source_doctype, src, function(r) {
						var source_doc = frappe.model.get_doc(opts.source_doctype, src);
						$.each(source_doc.items || [], function(i, row) {
							if(row.qty > flt(item_qty_map[row.item_code])) {
								already_set = false;
								return false;
							}
						})
					})

					if(already_set) {
						frappe.msgprint(__("You have already selected items from {0} {1}",
							[opts.source_doctype, src]));
						return;
					}

				})
			}
		}

		return frappe.call({
			// Sometimes we hit the limit for URL length of a GET request
			// as we send the full target_doc. Hence this is a POST request.
			type: "POST",
			method: 'frappe.model.mapper.map_docs',
			args: {
				"method": opts.method,
				"source_names": opts.source_name,
				"target_doc": cur_frm.doc,
				'args': opts.args
			},
			callback: function(r) {
				if(!r.exc) {
					var doc = frappe.model.sync(r.message);
					cur_frm.dirty();
					cur_frm.refresh();
				}
			}
		});
	}
	if(opts.source_doctype) {
		var d = new frappe.ui.form.MultiSelectDialog({
			doctype: opts.source_doctype,
			target: opts.target,
			date_field: opts.date_field || undefined,
			setters: opts.setters,
			get_query: opts.get_query,
			action: function(selections, args) {
				let values = selections;
				if(values.length === 0){
					frappe.msgprint(__("Please select {0}", [opts.source_doctype]))
					return;
				}
				opts.source_name = values;
				opts.setters = args;
				d.dialog.hide();
				_map();
			},
		});
	} else if(opts.source_name) {
		opts.source_name = [opts.source_name];
		_map();
	}
}
	*/
});

frappe.ui.form.on('Asset Booking Items', {
	asset: function (frm, cdt, cdn) {
		var doc = frm.doc;
		if (!doc.booking_items) return;
		let assets = doc.booking_items.map(o => { return o.asset })
		let item = frappe.get_doc(cdt, cdn)
		let same_items = assets.filter(a => { return a == item.asset })
		if (same_items.length > 1) {
			const editable_fields = ["asset", "current_location", "from_date", "to_date", "required_location"]
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

	booking_items_add: function (frm, cdt, cdn) {
		if (frm.doc.project) {
			frappe.model.set_value(cdt, cdn, "project", frm.doc.project)
		}
		if (frm.doc.requesting_employee) {
			frappe.model.set_value(cdt, cdn, "requesting_employee", frm.doc.requesting_employee)
		}
	}
});
