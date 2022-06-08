// Copyright (c) 2017, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Asset Maintenance', {
	setup: (frm) => {
		console.log("setup")
		frm.set_query("assign_to", "asset_maintenance_tasks", function(doc) {
			return {
				query: "erpnext.assets.doctype.asset_maintenance.asset_maintenance.get_team_members",
				filters: {
					maintenance_team: doc.maintenance_team
				}
			};
		});

		frm.set_indicator_formatter('maintenance_status', //not working
			function(doc) {
				console.log(doc)
				let indicator = 'blue';
				if (doc.maintenance_status == 'Overdue') {
					indicator = 'orange';
				}
				if (doc.maintenance_status == 'Cancelled') {
					indicator = 'red';
				}
				return indicator;
			}
		);

		frm.set_indicator_formatter("task_name",  //not working
			function(doc) {
				console.log(doc)
				let indicator = "green";
				if (doc.remarks) {
					indicator = "orange";
				}
				return indicator;
			}
		)
	},

	refresh: (frm) => {
		console.log(moment().year())
		if(!frm.is_new()) {
			frm.trigger('make_dashboard');
		}
		
		frm.add_custom_button(__("Test"), () => {
			frm.call({
				method: "update_asset_booking_availability"
			})
		});
		


		//frm.trigger("add_maintenance_schedule_description");
	},
	make_dashboard: (frm) => {
		if(!frm.is_new()) {
			frappe.call({
				method: 'erpnext.assets.doctype.asset_maintenance.asset_maintenance.get_maintenance_log',
				args: {asset_name: frm.doc.asset_name},
				callback: (r) => {
					if(!r.message) {
						return;
					}
					var section = frm.dashboard.add_section(`<h5 style="margin-top: 0px;">
						${ __("Maintenance Log") }</a></h5>`);
					var rows = $('<div></div>').appendTo(section);
					// show
					(r.message || []).forEach(function(d) {
						$(`<div class='row' style='margin-bottom: 10px;'>
							<div class='col-sm-3 small'>
								<a onclick="frappe.set_route('List', 'Asset Maintenance Log', 
									{'asset_name': '${d.asset_name}','maintenance_status': '${d.maintenance_status}' });">
									${d.maintenance_status} <span class="badge">${d.count}</span>
								</a>
							</div>
						</div>`).appendTo(rows);
					});
					frm.dashboard.show();
				}
			});
		}
	},

	make_maintenance_schedule: function (frm) {
		var me = frm;
		console.log("make_maintenance_schedule")
		//frappe.call({
		//	method: "erpnext.assets.doctype.asset_maintenance.asset_maintenance.make_maintenance_schedule",
		frm.call({
			doc: me.doc,
			method: "make_maintenance_schedule",
			args: {
				name: me.doc.name,
			},
			callback: (r) => {
				if (r.message) {
					let res = r.message;
					//console.log("res:",res)
					if (res.alert_msg) {
						frappe.msgprint({
							title: __("Notification"),
							indicator: "orange",
							message: __(res.alert_msg)
						})
					}
					if (res.response) {
						console.log(res.response)
					}
				}
			}
		})
	},

	add_maintenance_schedule_description: function (frm) {
		var me = frm;
		var doc = me.doc;
		//if (!doc.maintenance_schedule) return;
		for (let item of doc.maintenance_schedule) {
			//console.log(item)
			//let row_html = $(`[data-name="${item.name}"]`).find('[data-fieldname="task_name"]')
			//let row_html = $(`[data-name="${item.task_name}"]`)
			let row_html = $(`[data-name="${item.name}"]`).find(`[data-name="${item.task_name}"]`)
			if (item.remarks) {
				console.log(item.remarks)
				console.log(row_html)
				row_html.attr("title", item.remarks);
				row_html.attr("class", "indicator red");
			} else {
				row_html.removeAttr("title");
				row_html.attr("class", "indicator green");
			}
		}
	}
});

frappe.ui.form.on('Asset Maintenance Task', {
	start_date: (frm, cdt, cdn)  => {
		get_next_due_date(frm, cdt, cdn);
	},
	periodicity: (frm, cdt, cdn)  => {
		get_next_due_date(frm, cdt, cdn);
	},
	last_completion_date: (frm, cdt, cdn)  => {
		get_next_due_date(frm, cdt, cdn);
	},
	end_date: (frm, cdt, cdn)  => {
		get_next_due_date(frm, cdt, cdn);
	}
});

frappe.ui.form.on('Asset Maintenance Schedule', {
	before_maintenance_schedule_remove: async (frm, cdt, cdn) => {
		console.log("deleting", cdt, cdn)
		let row = frappe.get_doc(cdt, cdn)
		console.log("row",row)
		let referenced_logs = await frappe.db.get_list('Asset Maintenance Log',{
			filters:{
				'maintenance_schedule': cdn
			},
			fields: ['name','maintenance_schedule']
		})
		console.log(referenced_logs)
		if (referenced_logs.length > 0) {
			frappe.throw("Schedule is referenced in maintenance log(s). Cannot delete schedule")
		}
	},
})

/*
frappe.ui.form.on("Maintenance Task",{
	start_time: (frm, cdt, cdn) => {
		let row = frappe.get_doc(cdt,cdn);
		const now = moment()
		let start_datetime = moment(now)
		console.log("row",row.start_time)
		//moment()
		//frappe.model.set_value(cdt,cdn, "end_time", moment(row.start_time) )
	},
})
*/
var get_next_due_date = function (frm, cdt, cdn) {
	var d = locals[cdt][cdn];
	if (d.start_date && d.periodicity) {
		return frappe.call({
			method: 'erpnext.assets.doctype.asset_maintenance.asset_maintenance.calculate_next_due_date',
			args: {
				start_date: d.start_date,
				periodicity: d.periodicity,
				end_date: d.end_date,
				last_completion_date: d.last_completion_date,
				next_due_date: d.next_due_date
			},
			callback: function(r) {
				if (r.message) {
					frappe.model.set_value(cdt, cdn, "next_due_date", r.message);
				}
				else {
					frappe.model.set_value(cdt, cdn, "next_due_date", "");
				}
			}
		});
	}
};